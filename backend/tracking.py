# tracking.py - Modified for Nigeria context and Metric Units (with user's Mapbox fix & weather logging)

import requests
import re
import logging # Import logging
from typing import Tuple, List
from datetime import datetime
from config import Config # Keep Config import for API keys

# --- Setup Logger ---
# Use __name__ for logger specific to this module
logger = logging.getLogger(__name__)
# Ensure logger is configured (might be handled by app.py, but good practice)
if not logger.hasHandlers():
     logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s : %(message)s')


# URLs for the APIs needed by the functions below
GEOCODING_API_URL = "https://geocode.maps.co/search"
# Ensure this URL includes the profile and ends with a slash '/'
MAPBOX_DIRECTIONS_API_URL = "https://api.mapbox.com/directions/v5/mapbox/driving-traffic/"
WEATHER_API_URL = "http://api.weatherapi.com/v1/forecast.json" # Unchanged

# API tokens from config needed by the functions below
MAPBOX_ACCESS_TOKEN = Config.MAPBOX_TOKEN
GEOCODING_API_KEY = Config.GEOCODING_API_KEY # Use consistent naming if changed in Config

# --- Functions imported by diesel_api.py ---

def get_coordinates(place_name: str) -> Tuple[float, float] | Tuple[None, None]:
    """Gets coordinates using Geocode.maps.co API, specifying Nigeria."""
    search_query = f"{place_name}, Nigeria"
    params = { "q": search_query, "api_key": GEOCODING_API_KEY }
    logger.info(f"Geocoding query: {search_query}")

    try:
        response = requests.get(GEOCODING_API_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if not data:
            logger.error(f"No data received from geocoding API for {search_query}")
            return None, None

        if isinstance(data, list) and data:
            sorted_data = sorted(data, key=lambda place: place.get('importance', 0), reverse=True)
            top_result = sorted_data[0]
            lat = float(top_result.get('lat', 0.0))
            lon = float(top_result.get('lon', 0.0))
            if lat == 0.0 and lon == 0.0:
                 logger.warning(f"Geocoding returned (0,0) for {search_query}. Might be incorrect.")
                 return None, None # Treat (0,0) as invalid for safety
            coords = (lat, lon)
            logger.info(f"Geocoding result for {search_query}: {coords}")
            return coords
        else:
            logger.error(f"Unexpected data format or empty list from geocoding API for {search_query}")
            return None, None

    except requests.exceptions.RequestException as e:
        logger.error(f"Error retrieving coordinates for {search_query}: {e}")
        return None, None
    except (KeyError, ValueError, TypeError) as e:
        logger.error(f"Error processing coordinate data for {search_query}: {e}")
        return None, None
    except Exception as e:
        logger.error(f"An unexpected error occurred during geocoding for {search_query}: {e}")
        return None, None


def calculate_distances(start_coords: Tuple[float, float], end_coords: Tuple[float, float]) -> Tuple[float, float]:
    """Calculates city/highway distances in KILOMETERS using Mapbox Directions API."""
    if not start_coords or not end_coords or not all(isinstance(c, (float, int)) for c in start_coords + end_coords):
        logger.error("Invalid start or end coordinates provided for distance calculation.")
        return 0.0, 0.0

    city_distance_m = 0
    highway_distance_m = 0
    highway_pattern = re.compile(r'\b([ABME]|FGN)\d+\b', re.IGNORECASE)

    # User's FIX Applied: Removed "profile" key from params dict.
    params = {
        "access_token": MAPBOX_ACCESS_TOKEN,
        "alternatives": "false",
        "geometries": "geojson",
        "language": "en",
        "overview": "simplified",
        "steps": "true",
        "notifications": "none",
    }

    start_lat, start_lon = start_coords
    end_lat, end_lon = end_coords
    url = f"{MAPBOX_DIRECTIONS_API_URL}{start_lon},{start_lat};{end_lon},{end_lat}"

    try:
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        route_data = response.json()

        if not route_data.get("routes"):
            logger.error(f"No routes found between {start_coords} and {end_coords}.")
            return 0.0, 0.0

        for route in route_data["routes"]:
            if not route.get("legs"): continue
            for leg in route["legs"]:
                if not leg.get("steps"): continue
                for step in leg["steps"]:
                    if "maneuver" not in step or "distance" not in step: continue
                    distance_m = step["distance"]
                    name = step.get("name", "")
                    ref = step.get("ref", "")
                    classes = step.get("classes", [])

                    is_highway = False
                    if 'motorway' in classes: is_highway = True
                    elif highway_pattern.search(name) or highway_pattern.search(ref): is_highway = True

                    if is_highway: highway_distance_m += distance_m
                    else: city_distance_m += distance_m

        city_distance_km = city_distance_m / 1000.0
        highway_distance_km = highway_distance_m / 1000.0
        # logger.info(f"Calculated Distances: City={city_distance_km:.2f} km, Highway={highway_distance_km:.2f} km")
        return city_distance_km, highway_distance_km

    except requests.exceptions.HTTPError as e:
        logger.error(f"Error calculating distances via Mapbox (HTTP Error): {e}")
        if e.response is not None:
             logger.error(f"Response Status: {e.response.status_code}")
             try: logger.error(f"Response Body: {e.response.json()}")
             except ValueError: logger.error(f"Response Body: {e.response.text}")
        return 0.0, 0.0
    except requests.exceptions.RequestException as e:
        logger.error(f"Error calculating distances via Mapbox (Request Exception): {e}")
        return 0.0, 0.0
    except (KeyError, ValueError, TypeError) as e:
        logger.error(f"Error processing distance data from Mapbox: {e}")
        return 0.0, 0.0
    except Exception as e:
        logger.error(f"An unexpected error occurred during distance calculation: {e}")
        return 0.0, 0.0


def get_route_traffic_data(start_coords: Tuple[float, float], end_coords: Tuple[float, float]) -> Tuple[List[Tuple[float, float]], float]:
    """Gets route coordinates and traffic delay using Mapbox Directions API."""
    if not all(isinstance(c, (float, int)) for c in (start_coords or (None,)) + (end_coords or (None,))):
        logger.error("Invalid coordinates for traffic data.")
        return [], 0.0

    traffic_delay_minutes = 0
    coordinates_list = []
    params = {
        "access_token": MAPBOX_ACCESS_TOKEN,
        "geometries": "geojson",
        "steps": "false",
        "overview": "full",
        "annotations": "duration,congestion"
    }
    start_lat, start_lon = start_coords
    end_lat, end_lon = end_coords
    url = f"{MAPBOX_DIRECTIONS_API_URL}{start_lon},{start_lat};{end_lon},{end_lat}"

    try:
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()

        if not data.get("routes") or not data["routes"][0].get("geometry", {}).get("coordinates"):
            logger.error("Route geometry not found in Mapbox response for traffic.")
            return [], 0.0

        all_coords = data["routes"][0]["geometry"]["coordinates"]
        num_coords = len(all_coords)
        if num_coords == 0: return [], 0.0

        target_points = 15
        step = max(1, (num_coords -1) // target_points if target_points > 0 else 1)
        sampled_indices = list(range(0, num_coords, step))
        if num_coords > 0 and (num_coords - 1) not in sampled_indices: sampled_indices.append(num_coords - 1)
        elif not sampled_indices and num_coords > 0: sampled_indices.append(0)
        coordinates_list = [(all_coords[i][1], all_coords[i][0]) for i in sampled_indices]

        route_info = data['routes'][0]
        duration_typical = route_info.get('duration_typical')
        actual_duration = route_info.get('duration')

        if duration_typical is not None and actual_duration is not None:
            traffic_delay_seconds = max(0, actual_duration - duration_typical)
            traffic_delay_minutes = traffic_delay_seconds / 60.0
        else:
            traffic_delay_minutes = 0.0
            logger.warning("duration_typical or duration missing, cannot calculate traffic delay accurately.")

        # logger.info(f"Calculated Traffic Delay: {traffic_delay_minutes:.2f} minutes")
        return coordinates_list, traffic_delay_minutes

    except requests.exceptions.RequestException as e:
        logger.error(f"Error retrieving route traffic data via Mapbox: {e}")
        return [], 0.0
    except (KeyError, ValueError, IndexError, TypeError) as e:
        logger.error(f"Error processing route traffic data from Mapbox: {e}")
        return [], 0.0
    except Exception as e:
        logger.error(f"An unexpected error occurred during traffic data retrieval: {e}")
        return [], 0.0


# --- Weather Functions (ADDED DETAILED LOGGING) ---

def get_weather_data(api_key: str, coordinates_list: List[Tuple[float, float]], target_date: str) -> Tuple[float, str, str]:
    """Gets forecast weather data for a list of coordinates on a target date."""
    logger.info(f"Entering get_weather_data for {len(coordinates_list)} points, date: {target_date}")

    if not api_key or not coordinates_list or not target_date:
        logger.error("Missing API key, coordinates, or target date for weather data.")
        return 0.0, "Low", "Low"

    temperature_sum = 0
    snow_sum_cm = 0
    rain_sum_mm = 0
    visibility_sum_km = 0
    valid_coordinates = 0

    try:
        target_date_obj = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError:
        logger.error(f"Invalid target date format: {target_date}. Use YYYY-MM-DD.")
        return 0.0, "Low", "Low"

    # --- Loop through coordinates ---
    for index, (lat, lon) in enumerate(coordinates_list):
        # Use DEBUG level for per-point logs to avoid flooding INFO level
        logger.debug(f"Processing weather for point {index+1}/{len(coordinates_list)}: ({lat}, {lon})")

        if lat is None or lon is None:
            logger.warning(f"Skipping invalid coordinate pair (None) at index {index}.")
            continue

        params = { "key": api_key, "q": f"{lat},{lon}", "days": 4, "aqi": "no", "alerts": "no" }

        try:
            # --- Make API call ---
            logger.debug(f"  Requesting WeatherAPI: q={lat},{lon}")
            response = requests.get(WEATHER_API_URL, params=params, timeout=10) # Timeout added
            response.raise_for_status() # Check for HTTP errors (4xx, 5xx)
            weather_data = response.json()
            logger.debug(f"  WeatherAPI call successful for ({lat},{lon})")

            # --- Process Response ---
            if not weather_data.get('forecast', {}).get('forecastday'):
                logger.warning(f"  No forecast data found in response for {lat},{lon}")
                continue

            forecast_days = weather_data['forecast']['forecastday']
            found_date = False
            for day in forecast_days:
                date_str = day.get('date')
                if not date_str: continue
                try: date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
                except ValueError: continue

                if date_obj == target_date_obj:
                    day_data = day.get('day', {})
                    if not day_data: continue

                    temperature = day_data.get('avgtemp_c', 0.0)
                    snow_cm = day_data.get('totalsnow_cm', 0.0)
                    rain_mm = day_data.get('totalprecip_mm', 0.0)
                    visibility_km = day_data.get('avgvis_km', 10.0)

                    if isinstance(temperature, (int, float)): temperature_sum += temperature
                    if isinstance(snow_cm, (int, float)): snow_sum_cm += snow_cm
                    if isinstance(rain_mm, (int, float)): rain_sum_mm += rain_mm
                    if isinstance(visibility_km, (int, float)): visibility_sum_km += visibility_km

                    valid_coordinates += 1
                    found_date = True
                    logger.debug(f"  Processed data for target date {target_date} at ({lat},{lon})")
                    break # Found target date

            # if not found_date: # Reduce log noise unless needed
            #    logger.debug(f"  Target date {target_date} not found in forecast for {lat},{lon}")

        except requests.exceptions.Timeout:
             logger.error(f"  Timeout retrieving weather data for {lat},{lon}")
             continue # Skip to next coordinate on timeout
        except requests.exceptions.RequestException as e:
            logger.error(f"  Error retrieving weather data for {lat},{lon}: {e}")
            continue # Skip to next coordinate
        except (KeyError, ValueError, TypeError) as e:
            logger.error(f"  Error processing weather data JSON for {lat},{lon}: {e}")
            continue # Skip to next coordinate
        except Exception as e:
             logger.error(f"  An unexpected error occurred during weather check for {lat},{lon}: {e}")
             continue # Skip to next coordinate

    # --- Calculate Averages ---
    logger.info(f"Finished processing weather loop. Found data for {valid_coordinates}/{len(coordinates_list)} points.")
    if valid_coordinates > 0:
        average_temperature = temperature_sum / valid_coordinates
        average_snow_cm = snow_sum_cm / valid_coordinates
        average_rain_mm = rain_sum_mm / valid_coordinates
        average_visibility_km = visibility_sum_km / valid_coordinates

        logger.info(f"Weather Averages: Temp={average_temperature:.1f}C, Snow={average_snow_cm:.1f}cm, Rain={average_rain_mm:.1f}mm, Vis={average_visibility_km:.1f}km")

        snow_classification = categorize_snow_level(average_snow_cm, average_visibility_km)
        rain_classification = categorize_rain_level(average_rain_mm)
        logger.info("Weather data processing complete (returning calculated averages).")
        return average_temperature, snow_classification, rain_classification
    else:
        logger.warning("No valid weather data collected for any coordinate.")
        logger.info("Weather data processing complete (returning defaults).")
        return 0.0, "Low", "Low" # Return defaults if no data found

# --- Weather Helper Functions (Keep as is) ---

def categorize_snow_level(snow_cm: float, visibility_km: float) -> str:
    """Categorizes snow level based on average cm and visibility in km."""
    if snow_cm <= 0.1: return "Low"
    elif snow_cm <= 2.5: return "Low" if visibility_km >= 1.0 else "Medium"
    elif 2.5 < snow_cm <= 10: return "Medium" if visibility_km >= 0.8 else "Heavy"
    else: return "Heavy"

def categorize_rain_level(rain_mm: float) -> str:
    """Categorizes rain level based on average daily total mm."""
    if rain_mm <= 0.1: return "Low"
    elif rain_mm <= 5.0: return "Low"
    elif 5.0 < rain_mm <= 15.0: return "Medium"
    else: return "Heavy"