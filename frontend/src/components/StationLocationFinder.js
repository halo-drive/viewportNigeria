// Function to find location names for stations based on coordinates
// Can be added to RouteDisplay.jsx or as a separate utility

/**
 * Gets location names for coordinates using reverse geocoding
 * @param {Array} stations - Array of station objects with { coordinates: [lat, lng] }
 * @returns {Promise<Array>} Array of station objects with added name and stationName
 */
export const getStationLocationNames = async (stations) => {
  if (!stations || !stations.length) {
    console.log("No station coordinates provided");
    return [];
  }

  // console.log("Finding location names for stations:", stations);

  try {
    const locationPromises = stations.map(async (station) => {
      const [lat, lng] = station.coordinates;

      // Using Nominatim OpenStreetMap for reverse geocoding
      // Note: For production use, consider using a geocoding service with appropriate API key and usage limits
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            // Add a user agent as required by Nominatim usage policy
            'User-Agent': 'TransportLogisticsApp/1.0 (compatible; YourAppName/1.0; +http://yourappwebsite.com)' // Be specific
          }
        }
      );

      // Add a small delay between requests to comply with usage policy (e.g., 1 second)
      await new Promise(resolve => setTimeout(resolve, 1000));


      if (!response.ok) {
        // Log error but try to continue for other stations
        console.error(`Geocoding API error for ${lat},${lng}: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error("Error details:", errorText);
        // Return a default name on error
         return {
          ...station, // Keep original station data if any
          coordinates: [lat, lng],
          name: `Unknown Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          stationName: `Unknown Station`,
          rawData: null // Indicate geocoding failed
         };
      }

      const data = await response.json();

      // Format location name from address components
      let locationName = '';

      if (data.address) {
        const address = data.address;

        // Try to get a meaningful name based on address components
        const components = [];

        // Add road/street if available
        if (address.road) components.push(address.road);

        // Add area info
        if (address.suburb) components.push(address.suburb);
        else if (address.neighbourhood) components.push(address.neighbourhood);

        // Add city/town
        if (address.city) components.push(address.city);
        else if (address.town) components.push(address.town);
        else if (address.village) components.push(address.village);

        // Fallback to display name if no components found
        locationName = components.length > 0
          ? components.join(', ')
          : data.display_name ? data.display_name.split(',').slice(0, 2).join(',') : `Location at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      } else {
           locationName = data.display_name || `Location at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }

      // Get the first part before the comma and add "Station" (or a suitable suffix)
      const firstPart = locationName.split(',')[0].trim();
      // Consider if "Station" suffix is always appropriate, maybe just use the name?
      const stationName = `${firstPart} Station`; // Adjust suffix as needed

      // console.log(`Station at [${lat}, ${lng}] -> "${locationName}" -> "${stationName}"`);

      return {
        ...station, // Keep original station data if any
        coordinates: [lat, lng],
        name: locationName, // Full location name
        stationName: stationName, // Derived station name
        rawData: data // Full response for debugging or future use
      };
    });

    // Use Promise.allSettled to handle potential individual fetch errors gracefully
    const results = await Promise.allSettled(locationPromises);

    // Process results, logging any rejected promises
    const locations = results.map(result => {
        if (result.status === 'fulfilled') {
            return result.value;
        } else {
            console.error("Geocoding promise rejected:", result.reason);
            // Return a default structure for failed requests if not handled inside the promise
            // This part might be redundant if the inner catch handles it
             return {
               coordinates: [0, 0], // Placeholder coordinates
               name: 'Geocoding Failed',
               stationName: 'Error Station',
               rawData: null
             };
        }
    });

    return locations;
  } catch (error) {
    console.error("General error getting location names:", error);
    // Return default names for all stations if a major error occurs
    return stations.map(station => ({
      ...station,
      coordinates: station.coordinates,
      name: `Station at ${station.coordinates[0].toFixed(4)}, ${station.coordinates[1].toFixed(4)}`,
      stationName: `Error Station`
    }));
  }
};