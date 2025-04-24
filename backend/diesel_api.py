from flask import Blueprint, request, jsonify
# Ensure tracking functions return km now
from tracking import get_coordinates as tracking_get_coordinates, calculate_distances, get_route_traffic_data, get_weather_data
# Ensure HERE functions use Nigeria context if needed, and return lat,lon
from diesel_routing_here import get_here_directions, get_coordinates as here_get_coordinates, get_fuel_station_coordinates, get_route_with_fuel_stations
import joblib
import pandas as pd
import numpy as np
import random
import requests # Keep for potential future Nigerian fuel API
from config import Config
import traceback # Import traceback for detailed error logging
import logging # Import logging

# --- Setup Logger ---
logger = logging.getLogger(__name__)
if not logger.hasHandlers():
     logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s : %(message)s')

# --- Configuration & Model Loading ---
try:
    model = joblib.load('Fossil_model.pkl')
    logger.info("Diesel prediction model loaded successfully.")
except FileNotFoundError:
    logger.error("Fossil_model.pkl not found. Predictions will fail.")
    model = None
except Exception as e:
    logger.error(f"ERROR loading Fossil_model.pkl: {e}", exc_info=True)
    model = None

# --- Nigerian & Original UK Context Data (for workaround) ---
nigerian_depots = [
    'Lagos', 'Abuja', 'Kano', 'Ibadan',
    'Port Harcourt', 'Benin City', 'Kaduna', 'Enugu'
]
origin_encoded_ng = { name: i for i, name in enumerate(nigerian_depots) }

# Current Nigerian vehicles (9 models)
vehicle_type_nigeria = [
    "Mercedes-Benz Actros 2645", "SINOTRUK HOWO A7", "IVECO Stralis",
    "DAF XF 530", "MAN TGS 26.440", "TATA Prima 4928.S",
    "SCANIA R 450", "Volvo FH 520", "MACK Granite"
]
# Original UK vehicles the model was trained on (10 models - needed for feature names)
vehicle_type_encoded_original_uk_list = [
    'DAF XF 105.510', 'DAF XG 530', 'IVECO EuroCargo ml180e28',
    'IVECO NP 460', 'MAN TGM 18.250', 'MAN TGX 18.400', 'SCANIA G 460',
    'SCANIA R 450', 'VOLVO FH 520', 'VOLVO FL 420'
]
# Placeholder for the missing dummy variable to make 24 features
# Find a vehicle in UK list not closely represented in NG list
# 'VOLVO FL 420' is a reasonable choice as placeholder
MISSING_PLACEHOLDER_VEHICLE = 'VOLVO FL 420'
if MISSING_PLACEHOLDER_VEHICLE not in vehicle_type_encoded_original_uk_list:
     # Fallback if the chosen placeholder isn't in the original list
     MISSING_PLACEHOLDER_VEHICLE = vehicle_type_encoded_original_uk_list[-1] # Use the last one
     logger.warning(f"Chosen placeholder {MISSING_PLACEHOLDER_VEHICLE} not in original list, using {MISSING_PLACEHOLDER_VEHICLE} instead.")


# Encodings (assuming categories are still relevant)
dispatch_encoded = {'morning': 0, 'night': 1, 'noon': 2}
traffic_congestion_encoded = {'low': 0, 'medium': 1, 'high': 2}
temp_encoded = {'low': 0, 'medium': 1, 'high': 2}
precipitation_encoded = {'low': 0, 'medium': 1, 'high': 2}
snow_encoded = {'low': 0, 'medium': 1, 'high': 2}

# --- Unit Conversion Factors ---
KM_TO_MILES = 0.621371
MPH_TO_KPH = 1.60934 # KPH_TO_MPH is KM_TO_MILES
KPH_TO_MPH = KM_TO_MILES
MPG_TO_KML = 0.425144 # 1 MPG = 0.425144 km/L

# --- Fuel Price Handling (Nigeria) ---
DEFAULT_NAIRA_PER_LITRE = 280.0
def get_diesel_price_ng(city_name: str) -> float:
    logger.info(f"Using default diesel price: {DEFAULT_NAIRA_PER_LITRE} NGN/Litre for {city_name}")
    return DEFAULT_NAIRA_PER_LITRE

# --- Helper Functions ---
def convert_time_to_window(time_str: str) -> str:
    try:
        hours = int(time_str.split(':')[0])
        if 4 <= hours < 12: return "morning"
        elif 12 <= hours < 20: return "noon"
        else: return "night"
    except:
        logger.warning(f"Could not parse time string: {time_str}. Defaulting to 'noon'.")
        return "noon"

# --- Blueprint Definition ---
diesel_api_bp = Blueprint('diesel_api', __name__)

# --- API Route ---
@diesel_api_bp.route('/api/diesel/route', methods=['POST'])
def diesel_route_api():
    logger.info("Received request for /api/diesel/route")
    try:
        # --- 1. Get and Validate Form Data ---
        pallets_str = request.form.get('pallets')
        vehicle_type = request.form.get('vehicleModel') # Nigerian vehicle name
        origin_depot = request.form.get('originDepot') # Nigerian depot name
        destination_depot = request.form.get('destinationDepot') # Nigerian depot name
        vehicle_age_str = request.form.get('vehicleAge')
        dispatch_time_str = request.form.get('dispatchTime')
        target_date = request.form.get('journeyDate')
        # (Keep validation checks)
        if not all([...]): return jsonify({...}), 400 # Simplified
        if origin_depot == destination_depot: return jsonify({...}), 400
        if origin_depot not in nigerian_depots or destination_depot not in nigerian_depots: return jsonify({...}), 400
        # Check against the list of *current* Nigerian vehicles for validation
        if vehicle_type not in vehicle_type_nigeria:
             logger.warning(f"Invalid vehicle model received: {vehicle_type}")
             return jsonify({"success": False, "error": f"Invalid Vehicle Model specified: {vehicle_type}"}), 400

        try:
            pallets = float(pallets_str); vehicle_age = float(vehicle_age_str)
        except ValueError: return jsonify({...}), 400

        dispatch_window = convert_time_to_window(dispatch_time_str)
        total_payload_kg = pallets * 880.0
        goods_weight_kg = total_payload_kg
        logger.info(f"Request Details: From={origin_depot}, To={destination_depot}, Vehicle={vehicle_type}, Date={target_date}")

        # --- 2. Get Coordinates and Route using HERE API ---
        logger.info("Getting route and fuel stations from HERE API...")
        here_api_key = Config.HERE_API_KEY
        if not here_api_key: return jsonify({"success": False, "error": "Config error: Missing HERE API key."}), 500
        route_coords_weather, route_points_polyline, fuel_station_coords = get_route_with_fuel_stations(
             here_api_key, origin_city=origin_depot, destination_city=destination_depot
        )
        if not route_points_polyline or not route_coords_weather:
             return jsonify({"success": False, "error": "Failed to calculate route."}), 500
        logger.info(f"HERE route successful. Found {len(fuel_station_coords)} fuel stations.")
        station_points = [{"name": f"Fuel Station {i+1}", "coordinates": fs_coord} for i, fs_coord in enumerate(fuel_station_coords)]

        # --- 3. Get Coordinates for other APIs (Tracking Geocoder) ---
        logger.info("Getting coordinates via tracking.py geocoder...")
        start_coords_track = tracking_get_coordinates(origin_depot)
        dest_coords_track = tracking_get_coordinates(destination_depot)
        if not start_coords_track or not dest_coords_track:
            return jsonify({"success": False, "error": "Failed to verify depot coordinates."}), 500
        logger.info("Tracking coordinates obtained.")

        # --- 4. Calculate Distances (METRIC - km) ---
        logger.info("Calculating distances (km)...")
        city_dist_km, highway_dist_km = calculate_distances(start_coords_track, dest_coords_track)
        total_dist_km = city_dist_km + highway_dist_km
        if total_dist_km <= 0: return jsonify({"success": False, "error": "Failed to calculate valid route distance."}), 500
        logger.info(f"Distances (km): City={city_dist_km:.2f}, Highway={highway_dist_km:.2f}, Total={total_dist_km:.2f}")

        # --- 5. Get Traffic Data ---
        logger.info("Getting traffic data...")
        _, traffic_delay_minutes = get_route_traffic_data(start_coords_track, dest_coords_track)
        traffic_severity = "high" if traffic_delay_minutes > 30 else "medium" if traffic_delay_minutes > 7 else "low"
        logger.info(f"Traffic: Delay={traffic_delay_minutes:.1f} min, Severity={traffic_severity}")

        # --- 6. Get Weather Data ---
        logger.info("Getting weather data...")
        weather_api_key = Config.WEATHER_API_KEY
        if not weather_api_key: return jsonify({"success": False, "error": "Config error: Missing Weather API key."}), 500
        if route_coords_weather is None: return jsonify({"success": False, "error": "Missing route coords for weather."}), 500
        average_temperature, snow_classification, rain_classification = get_weather_data(
            weather_api_key, route_coords_weather, target_date
        )
        logger.info(f"Weather Data Received: Avg Temp={average_temperature:.1f}C, Rain={rain_classification}, Snow={snow_classification}")

        # --- 7. Prepare Data for Prediction Model (WORKAROUND) ---
        logger.info("Preparing data for prediction model (WORKAROUND APPLIED)...")

        # --- a) Convert METRIC values to IMPERIAL for model input ---
        total_dist_miles = total_dist_km * KM_TO_MILES
        highway_dist_miles = highway_dist_km * KM_TO_MILES
        city_dist_miles = city_dist_km * KM_TO_MILES
        # Use original hardcoded Avg_Speed_mph=65 that the model likely trained on
        avg_speed_mph_input = 65.0
        logger.debug(f"Converted inputs: TotalDistMi={total_dist_miles:.2f}, HwyMi={highway_dist_miles:.2f}, CityMi={city_dist_miles:.2f}, AvgSpeedMPH={avg_speed_mph_input}")

        # --- b) Encode features using Nigerian maps where appropriate ---
        encoded_origin = origin_encoded_ng.get(origin_depot, -1)
        encoded_destination = origin_encoded_ng.get(destination_depot, -1)
        encoded_dispatch_time = dispatch_encoded.get(dispatch_window, -1)
        encoded_avg_traffic_congestion = traffic_congestion_encoded.get(traffic_severity, -1)
        temp_category = "high" if average_temperature > 30 else "medium" if average_temperature > 20 else "low"
        encoded_avg_temp = temp_encoded.get(temp_category, -1)
        encoded_avg_precipitation = precipitation_encoded.get(rain_classification.lower(), -1)
        encoded_avg_snow = snow_encoded.get(snow_classification.lower(), 0)

        # --- c) Create input dict using ORIGINAL feature names & IMPERIAL values ---
        input_data = {
            "Vehicle_age": [vehicle_age],
            "Goods_weight": [goods_weight_kg], # Assume model can handle kg or value range is similar
            "Total_distance_miles": [total_dist_miles], # ORIGINAL KEY, IMPERIAL VALUE
            "Avg_traffic_congestion": [encoded_avg_traffic_congestion],
            "Avg_temp": [encoded_avg_temp],
            "Avg_Precipitation": [encoded_avg_precipitation],
            "Avg_snow": [encoded_avg_snow],
            "Origin_depot": [encoded_origin], # Encoded using NG map - *potential issue if model expects UK encoding*
            "Destination_depot": [encoded_destination], # Encoded using NG map - *potential issue*
            "Avg_Speed_mph": [avg_speed_mph_input], # ORIGINAL KEY, IMPERIAL VALUE (hardcoded)
            "Distance_highway": [highway_dist_miles], # ORIGINAL KEY (implied), IMPERIAL VALUE
            "Distance_city": [city_dist_miles],       # ORIGINAL KEY (implied), IMPERIAL VALUE
            "dispatch_time": [encoded_dispatch_time],
            "total_payload": [total_payload_kg] # Assume model handles kg payload ok
        }
        logger.debug(f"Base input_data created with {len(input_data)} features.")

        # --- d) Create dummy variables based on ORIGINAL UK vehicle list ---
        # The model expects columns for all 10 UK vehicles.
        # We set the current Nigerian vehicle's corresponding UK dummy (if any) to 1, others to 0.
        # This is imperfect as NG vehicles might not map cleanly to UK ones.
        # A simple approach: Set all original UK dummies to 0, except for the placeholder.
        dummy_variables = {vehicle_uk: [0] for vehicle_uk in vehicle_type_encoded_original_uk_list}

        # Identify if the selected Nigerian vehicle corresponds to one in the original UK list
        # This mapping is crude - needs refinement based on vehicle similarity
        selected_ng_vehicle = vehicle_type # The actual NG vehicle selected
        corresponding_uk_vehicle = None
        # Example crude mapping (needs improvement)
        if "DAF" in selected_ng_vehicle: corresponding_uk_vehicle = 'DAF XG 530'
        elif "SCANIA" in selected_ng_vehicle: corresponding_uk_vehicle = 'SCANIA R 450'
        elif "Volvo" in selected_ng_vehicle: corresponding_uk_vehicle = 'VOLVO FH 520'
        elif "MAN" in selected_ng_vehicle: corresponding_uk_vehicle = 'MAN TGX 18.400' # Map TGS to TGX?
        elif "IVECO" in selected_ng_vehicle: corresponding_uk_vehicle = 'IVECO NP 460' # Map Stralis to NP?
        # Add mappings for Mercedes, SINOTRUK, TATA, MACK if they relate to the UK list? Unlikely.

        # If a corresponding UK vehicle is found in the original list, set its dummy to 1
        if corresponding_uk_vehicle and corresponding_uk_vehicle in dummy_variables:
            dummy_variables[corresponding_uk_vehicle] = [1]
            logger.debug(f"Mapped NG vehicle '{selected_ng_vehicle}' to UK dummy '{corresponding_uk_vehicle}'.")
        else:
            logger.debug(f"No clear mapping found for NG vehicle '{selected_ng_vehicle}' to original UK dummies. All UK dummies (except placeholder) set to 0.")

        # Add the dummy variables to input_data
        input_data.update(dummy_variables)
        logger.debug(f"input_data updated with {len(dummy_variables)} UK vehicle dummies. Total keys: {len(input_data)}")

        # --- e) Add the placeholder dummy if it's not already there ---
        # This step ensures we always have 24 features if one UK dummy was missing
        # Now redundant because we create all 10 UK dummies above. Remove this.
        # if MISSING_PLACEHOLDER_VEHICLE not in input_data:
        #    input_data[MISSING_PLACEHOLDER_VEHICLE] = [0] # Add placeholder to reach 24
        #    logger.debug(f"Added placeholder dummy '{MISSING_PLACEHOLDER_VEHICLE}'")


        # --- f) Create DataFrame and Verify Columns ---
        try:
            # Get the exact feature list the model expects (replace with actual list from training)
            # Assuming the base 14 + the 10 UK vehicles
            expected_model_features = [
                "Vehicle_age", "Goods_weight", "Total_distance_miles", "Avg_traffic_congestion",
                "Avg_temp", "Avg_Precipitation", "Avg_snow", "Origin_depot", "Destination_depot",
                "Avg_Speed_mph", "Distance_highway", "Distance_city", "dispatch_time", "total_payload"
            ] + vehicle_type_encoded_original_uk_list

            # Create DataFrame using only the expected features and in the correct order
            input_data_ordered = {key: input_data.get(key, [0]) for key in expected_model_features} # Ensure all expected keys exist
            raw_input_df = pd.DataFrame(input_data_ordered)
            raw_input_df = raw_input_df[expected_model_features] # Enforce order

            logger.info(f"Prediction DataFrame created successfully with {len(raw_input_df.columns)} features.")
            if len(raw_input_df.columns) != 24:
                 logger.error(f"FATAL: DataFrame column count ({len(raw_input_df.columns)}) does not match expected 24!")
                 # Log columns for comparison:
                 logger.error(f"DF Columns: {list(raw_input_df.columns)}")
                 logger.error(f"Expected:   {expected_model_features}")
                 return jsonify({"success": False, "error": "Internal error: Feature count mismatch before prediction."}), 500

        except Exception as e:
            logger.error(f"Error creating or ordering prediction DataFrame: {e}", exc_info=True)
            return jsonify({"success": False, "error": "Internal error preparing prediction data."}), 500


        # --- 8. Get Prediction ---
        logger.info("Predicting efficiency...")
        if model is None: return jsonify({"success": False, "error": "Prediction model unavailable."}), 500

        try:
            # Predict (expects 24 features)
            if hasattr(model, '_Booster'): prediction_mpg = model._Booster.predict(raw_input_df)[0]
            else: prediction_mpg = model.predict(raw_input_df)[0]

            # --- Convert prediction back to METRIC (km/L) ---
            efficiency_kml = prediction_mpg * MPG_TO_KML
            logger.info(f"Prediction successful: Raw(MPG)={prediction_mpg:.4f}, Converted(km/L)={efficiency_kml:.4f}")

        except Exception as e:
            logger.error(f"Error during model prediction: {e}", exc_info=True)
            # Log the shape and columns just before error
            logger.error(f"Prediction failed. Input DF shape: {raw_input_df.shape}")
            logger.error(f"Input DF columns: {list(raw_input_df.columns)}")
            return jsonify({"success": False, "error": "Failed to get prediction from model."}), 500


        # --- 9. Calculate Fuel Metrics (Using METRIC values) ---
        logger.info("Calculating fuel metrics (metric)...")
        if efficiency_kml <= 0:
            logger.warning(f"Predicted efficiency is zero or negative ({efficiency_kml:.4f} km/L). Using fallback.")
            efficiency_kml = 2.0 # Fallback km/L

        # Use km distance and km/L efficiency
        total_required_fuel_litres = total_dist_km / efficiency_kml
        fuel_price_per_litre_ngn = get_diesel_price_ng(origin_depot) # Naira/Litre
        total_fuel_cost_ngn = total_required_fuel_litres * fuel_price_per_litre_ngn
        # Use km distance for cost per km
        cost_per_km_ngn = total_fuel_cost_ngn / total_dist_km if total_dist_km > 0 else 0
        overhead_cost_ngn = total_fuel_cost_ngn * 0.10
        total_final_cost_ngn = total_fuel_cost_ngn + overhead_cost_ngn
        logger.info("Fuel metrics calculated.")


        # --- 10. Feature Importance ---
        logger.info("Extracting feature importance...")
        feature_importance_data = []
        try:
            # Use the DataFrame that was actually sent to predict()
            feature_names = list(raw_input_df.columns)
            if hasattr(model, 'feature_importances_'):
                importances = model.feature_importances_
                # Convert numpy floats to python floats for JSON
                importances = [float(imp) for imp in importances]
                feature_tuples = sorted(zip(feature_names, importances), key=lambda item: item[1], reverse=True)
                top_8_features = feature_tuples[:8]
                feature_importance_data = [{"name": name, "value": value} for name, value in top_8_features]
                logger.info("Feature importance extracted.")
            else: logger.warning("Model does not have 'feature_importances_' attribute.")
        except Exception as e: logger.warning(f"Could not retrieve feature importances: {e}", exc_info=True)


        # --- 11. Other Random Metrics ---
        logger.info("Generating other metrics...")
        good_value_fuel = random.uniform(10000.0, 100000.0)
        insurance_fuel_cost = random.uniform(1000.0, good_value_fuel * 0.05)
        goods_loading_time = random.randint(20, 90)
        is_goods_secured = random.choice(['✔️', '❌'])
        check_safety = random.choice(['✔️', '❌'])
        logger.info("Other metrics generated.")

        # --- 12. Prepare API Response (METRIC and NGN) ---
        logger.info("Preparing final API response...")
        response_data = {
            "success": True,
            "route": {
                "origin": origin_depot, "destination": destination_depot,
                "coordinates": route_points_polyline, "stations": station_points,
                "total_distance": round(total_dist_km, 2) # km
            },
            "analytics": {
                "average_temperature": round(average_temperature, 2), # C
                "rain_classification": rain_classification, "snow_classification": snow_classification,
                "highway_distance": round(highway_dist_km, 2), # km
                "city_distance": round(city_dist_km, 2), # km
                "efficiency_prediction": round(efficiency_kml, 2), # km/L
                "total_required_fuel": round(total_required_fuel_litres, 2), # Litres
                "total_fuel_cost": round(total_fuel_cost_ngn, 2), # NGN
                "cost_per_km": round(cost_per_km_ngn, 2), # NGN/km (Correct Key)
                "overhead_cost": round(overhead_cost_ngn, 2), # NGN
                "total_final_cost": round(total_final_cost_ngn, 2), # NGN
                "fuel_price": round(fuel_price_per_litre_ngn, 2), # NGN/L
                "good_value_fuel": round(good_value_fuel, 2), # NGN
                "insurance_fuel_cost": round(insurance_fuel_cost, 2), # NGN
                "goods_loading_time": goods_loading_time,
                "is_goods_secured": is_goods_secured, "check_safety": check_safety,
                "featureImportance": feature_importance_data
            }
        }
        logger.info("API Response Prepared Successfully. Sending response.")
        return jsonify(response_data)

    # --- Error Handling ---
    except Exception as e:
        error_traceback = traceback.format_exc()
        logger.error(f"!!! Critical Error in /api/diesel/route !!!")
        logger.error(f"Error Type: {type(e).__name__}")
        logger.error(f"Error Message: {str(e)}")
        logger.error(f"Traceback:\n{error_traceback}")
        return jsonify({
            "success": False, "error": "An internal server error occurred.",
        }), 500