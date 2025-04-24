# backend/diesel_routing_here.py
# Reverted fuel search logic, sampling ONLY weather points list.

import folium
import requests
from geopy.distance import geodesic
from typing import Tuple, List, Optional
from collections import namedtuple
from config import Config
import logging

logger = logging.getLogger(__name__)
if not logger.hasHandlers():
     logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s : %(message)s')

FORMAT_VERSION = 1
DECODING_TABLE = [
    62, -1, -1, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1, -1,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    22, 23, 24, 25, -1, -1, -1, -1, 63, -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
    36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51
]
PolylineHeader = namedtuple('PolylineHeader', 'precision,third_dim,third_dim_precision')

# --- Polyline Decoding Functions (Unchanged) ---
def decode_header(decoder):
    version = next(decoder)
    if version != FORMAT_VERSION: raise ValueError('Invalid format version')
    value = next(decoder)
    precision = value & 15
    value >>= 4
    third_dim = value & 7
    third_dim_precision = (value >> 3) & 15
    return PolylineHeader(precision, third_dim, third_dim_precision)

def decode_char(char):
    char_value = ord(char)
    try: value = DECODING_TABLE[char_value - 45]
    except IndexError: raise ValueError('Invalid encoding')
    if value < 0: raise ValueError('Invalid encoding')
    return value

def to_signed(value):
    if value & 1: value = ~value
    value >>= 1
    return value

def decode_unsigned_values(encoded):
    result = shift = 0
    for char in encoded:
        value = decode_char(char)
        result |= (value & 0x1F) << shift
        if (value & 0x20) == 0:
            yield result
            result = shift = 0
        else: shift += 5
    if shift > 0: raise ValueError('Invalid encoding')

def iter_decode(encoded):
    last_lat = last_lng = last_z = 0
    decoder = decode_unsigned_values(encoded)
    header = decode_header(decoder)
    factor_degree = 10.0 ** header.precision
    factor_z = 10.0 ** header.third_dim_precision
    third_dim = header.third_dim
    while True:
        try: last_lat += to_signed(next(decoder))
        except StopIteration: return
        try:
            last_lng += to_signed(next(decoder))
            if third_dim:
                last_z += to_signed(next(decoder))
                yield (last_lat / factor_degree, last_lng / factor_degree, last_z / factor_z)
            else: yield (last_lat / factor_degree, last_lng / factor_degree)
        except StopIteration: raise ValueError("Invalid encoding. Premature ending reached")
# --- End Polyline Decoding ---


# --- API Call Functions (Unchanged from previous working state) ---
def get_here_directions(origin: str, destination: str, api_key: str) -> Optional[List[Tuple[float, float]]]:
    url = f"https://router.hereapi.com/v8/routes?transportMode=car&origin={origin}&destination={destination}&return=polyline&apikey={api_key}"
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        routes = data.get('routes', [])
        if routes and routes[0].get('sections') and routes[0]['sections'][0].get('polyline'):
            decoded_points = list(iter_decode(routes[0]['sections'][0]['polyline']))
            return [(p[0], p[1]) for p in decoded_points if len(p) >= 2]
        logger.warning(f"No valid route/polyline in HERE response: {origin} -> {destination}")
        return None
    except Exception as e:
        logger.error(f"Error in get_here_directions: {e}", exc_info=True)
        return None

def get_coordinates(place_name: str, api_key: str) -> Optional[Tuple[float, float]]:
    search_query = f"{place_name}, Nigeria"
    logger.info(f"HERE Geocoding query: {search_query}")
    url = f"https://geocode.search.hereapi.com/v1/geocode"
    params = { "q": search_query, "apiKey": api_key }
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data.get('items'):
            location = data['items'][0].get('position')
            if location and 'lat' in location and 'lng' in location:
                coords = (location['lat'], location['lng'])
                logger.info(f"HERE Geocoding result for {search_query}: {coords}")
                return coords
        logger.error(f"No valid items/position in HERE Geocoding response for {search_query}")
        return None
    except Exception as e:
        logger.error(f"Error in get_coordinates for {search_query}: {e}", exc_info=True)
        return None

def get_fuel_station_coordinates(coords: Tuple[float, float], api_key: str) -> Optional[Tuple[float, float]]:
    if not coords or coords[0] is None or coords[1] is None:
         logger.error("Invalid coordinates for fuel station search.")
         return None
    base_url = 'https://discover.search.hereapi.com/v1/discover'
    params = {'q': 'fuel station', 'apiKey': api_key, 'at': f'{coords[0]},{coords[1]}', 'limit': 5 }
    try:
        response = requests.get(base_url, params=params, timeout=10)
        response.raise_for_status()
        fuel_stations = response.json()
        if fuel_stations.get('items'):
            closest_station = min(fuel_stations['items'], key=lambda x: x.get('distance', float('inf')))
            position = closest_station.get('position')
            if position and 'lat' in position and 'lng' in position:
                return position['lat'], position['lng']
        logger.warning(f"No fuel stations found near {coords}")
        return None
    except Exception as e:
        logger.error(f"Error in get_fuel_station_coordinates near {coords}: {e}", exc_info=True)
        return None
# --- End API Call Functions ---


def get_route_with_fuel_stations(api_key: str, origin_city: str, destination_city: str) -> Tuple[Optional[List[Tuple[float, float]]], Optional[List[Tuple[float, float]]], List[Tuple[float, float]]]:
    """
    Calculates route, finds fuel stations, returns SAMPLED weather coords & FULL polyline.
    Returns: (sampled_weather_coords, full_route_polyline_points, fuel_station_coords_list)
    """
    start_coords = get_coordinates(origin_city, api_key)
    end_coords = get_coordinates(destination_city, api_key)
    if not start_coords or not end_coords:
        logger.error(f"Could not get coords for {origin_city} or {destination_city}.")
        return None, None, []

    # 1. Get the FULL route polyline
    full_route_polyline_points = get_here_directions(f"{start_coords[0]},{start_coords[1]}", f"{end_coords[0]},{end_coords[1]}", api_key)
    if not full_route_polyline_points:
        logger.error(f"Unable to retrieve route points between {origin_city} and {destination_city}.")
        return None, None, []

    # 2. Calculate Total Distance (using the full polyline)
    total_distance_km = 0.0
    try:
        for i in range(len(full_route_polyline_points) - 1):
            p1, p2 = full_route_polyline_points[i], full_route_polyline_points[i+1]
            # Basic type/length check before distance calc
            if isinstance(p1, tuple) and len(p1)==2 and isinstance(p2, tuple) and len(p2)==2:
                 total_distance_km += geodesic(p1, p2).km
            else: logger.warning(f"Skipping invalid point in distance calc: {p1} or {p2}")
    except Exception as e:
        logger.error(f"Error calculating total route distance: {e}", exc_info=True)
        # Reset distance if calculation failed to avoid issues later
        total_distance_km = 0.0
    logger.info(f"Total calculated route distance: {total_distance_km:.2f} km")

    # 3. Find Fuel Stations (using the FULL polyline)
    fuel_station_coords = []
    if total_distance_km > 10: # Only search if route is reasonably long
        interval_distance = total_distance_km / 4.0 # Search roughly every quarter
        cumulative_distance = 0.0
        last_fuel_stop_distance = 0.0 # Tracks distance since last search point where stop was added

        # Iterate through the SEGMENTS of the full polyline
        for i in range(len(full_route_polyline_points) - 1):
            p1 = full_route_polyline_points[i]
            p2 = full_route_polyline_points[i+1]

            segment_distance = 0.0
            # Safely calculate segment distance
            try:
                if isinstance(p1, tuple) and len(p1)==2 and isinstance(p2, tuple) and len(p2)==2:
                    segment_distance = geodesic(p1, p2).km
            except Exception as e: logger.warning(f"Error calculating segment distance: {e}")

            cumulative_distance += segment_distance
            last_fuel_stop_distance += segment_distance

            # Check if we've covered roughly an interval distance since the last added stop
            # Also avoid searching too close to the end of the route
            if last_fuel_stop_distance >= interval_distance and cumulative_distance < (total_distance_km - interval_distance / 2.0):
                search_point = p2 # Search near the end point of this segment
                logger.info(f"Searching for fuel station near point index {i+1} ({search_point}) at cumulative distance {cumulative_distance:.1f} km")
                fuel_coords = get_fuel_station_coordinates(search_point, api_key)

                if fuel_coords:
                    # Check if this station is too close to the last added one
                    is_duplicate = False
                    if fuel_station_coords: # Only check if list is not empty
                         is_duplicate = geodesic(fuel_coords, fuel_station_coords[-1]).km < 5.0 # Don't add if within 5km of last

                    if not is_duplicate:
                        logger.info(f"Found fuel station: {fuel_coords}")
                        fuel_station_coords.append(fuel_coords)
                        last_fuel_stop_distance = 0.0 # Reset distance tracker since we added one
                    else:
                        logger.info(f"Skipping nearby/duplicate fuel station: {fuel_coords}")
                # If fuel_coords is None, search continues on next suitable segment
    else:
        logger.info("Route too short or distance calculation failed, skipping fuel station search.")

    logger.info(f"Final Fuel Station Coordinates Found: {fuel_station_coords}")

    # 4. Sample Coordinates ONLY FOR Weather Check (from the FULL polyline)
    sampled_weather_coords = []
    num_route_points = len(full_route_polyline_points)
    target_points_for_weather = 15 # Define the target number of points

    # Ensure we have points to sample from
    if num_route_points > 0:
        if num_route_points <= target_points_for_weather:
            # Use all points if fewer than target
            sampled_weather_coords = [start_coords] + full_route_polyline_points # Include start explicitly
        else:
            # Calculate step for sampling from the polyline points
            # Ensure we include start and end points
            indices = [0] # Start with the first point index
            step = (num_route_points - 1) / (target_points_for_weather - 1) if target_points_for_weather > 1 else num_route_points
            current_index_float = 0.0
            for _ in range(target_points_for_weather - 2): # Add intermediate points
                current_index_float += step
                # Add index, ensuring it doesn't exceed bounds
                indices.append(min(round(current_index_float), num_route_points - 1))

            indices.append(num_route_points - 1) # Ensure last point index is included

            # Remove potential duplicates from rounding and sort
            unique_sorted_indices = sorted(list(set(indices)))

            # Select points using the unique indices from the full polyline
            sampled_weather_coords = [full_route_polyline_points[i] for i in unique_sorted_indices]
            # Explicitly add start_coords if it wasn't included by index 0 (should be, but safe check)
            if start_coords not in sampled_weather_coords:
                 sampled_weather_coords.insert(0, start_coords)

    logger.info(f"Sampled Route Coordinates for Weather Check ({len(sampled_weather_coords)} points): [List Omitted]")

    # 5. Return the required tuple
    #    - sampled_weather_coords: For the weather API calls
    #    - full_route_polyline_points: For drawing the route on the map
    #    - fuel_station_coords: List of coordinates for fuel stops
    return sampled_weather_coords, full_route_polyline_points, fuel_station_coords


# --- Map Display Function (Unchanged) ---
def display_route_on_map(route_coordinates, fuel_station_coords, origin_city, destination_city, route_points):
    if not route_coordinates: return
    start_coords = route_coordinates[0]
    # Use last point of the *polyline* as end coords for map marker consistency
    end_coords = route_points[-1] if route_points else route_coordinates[-1]
    map_center = start_coords
    route_map = folium.Map(location=map_center, zoom_start=7)
    folium.Marker(location=start_coords, popup=origin_city, icon=folium.Icon(color='green')).add_to(route_map)
    folium.Marker(location=end_coords, popup=destination_city, icon=folium.Icon(color='red')).add_to(route_map)
    for idx, fuel_stop in enumerate(fuel_station_coords):
        folium.Marker(location=fuel_stop, popup=f'Fuel Stop {idx+1}', icon=folium.Icon(color='blue', icon='tint', prefix='fa')).add_to(route_map)
    if route_points:
        folium.PolyLine(locations=route_points, color='blue', weight=5, opacity=0.7).add_to(route_map)
    map_file = "templates/diesel_route_map.html"
    try:
        route_map.save(map_file)
        logger.info(f"Route map saved to {map_file}")
    except Exception as e:
        logger.error(f"Failed to save route map: {e}")
    return route_map

# --- Standalone Test Block (Unchanged) ---
if __name__ == '__main__':
    logger.info("Testing HERE API functions (standalone)...")
    test_api_key = Config.HERE_API_KEY
    if not test_api_key: logger.error("HERE_API_KEY not found in config.py.")
    else:
        lagos_coords = get_coordinates("Lagos", test_api_key)
        abuja_coords = get_coordinates("Abuja", test_api_key)
        logger.info(f"Test Lagos Coords: {lagos_coords}")
        logger.info(f"Test Abuja Coords: {abuja_coords}")
        if lagos_coords and abuja_coords:
            directions = get_here_directions(f"{lagos_coords[0]},{lagos_coords[1]}", f"{abuja_coords[0]},{abuja_coords[1]}", test_api_key)
            logger.info(f"Test Directions Lagos->Abuja (point count): {len(directions) if directions else 'None'}")
            fuel_stop = get_fuel_station_coordinates(lagos_coords, test_api_key)
            logger.info(f"Test Nearest fuel station to Lagos: {fuel_stop}")
            logger.info("\nTesting full route planning Lagos -> Abuja...")
            weather_coords, polyline_points, fuel_stations = get_route_with_fuel_stations(test_api_key, "Lagos", "Abuja")
            if weather_coords and polyline_points:
                 logger.info(f"Returned {len(weather_coords)} points for weather check.")
                 logger.info(f"Returned {len(polyline_points)} points for route polyline.")
                 logger.info(f"Found {len(fuel_stations)} fuel stops.")
                 # display_route_on_map(weather_coords, fuel_stations, "Lagos", "Abuja", polyline_points)
            else: logger.error("Full route planning test failed.")
        else: logger.error("Skipping further tests due to coordinate lookup failure.")