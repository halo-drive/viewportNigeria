import React, { useEffect, useState, useContext, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine';
import markerImg from "../assets/marker.png";
import dieselPumpImg from "../assets/diesel-pump.png";
import { AppContext } from '../AppContext';
import { getStationLocationNames } from './StationLocationFinder'; // Assuming correct path
import StationCard from './StationCard'; // Assuming correct path

// Depot coordinates mapping (Nigerian cities)
const depotCoordinates = {
  'Lagos': [6.5244, 3.3792],
  'Abuja': [9.0765, 7.3986],
  'Kano': [12.0022, 8.5920],
  'Ibadan': [7.3776, 3.9470],
  'Port Harcourt': [4.8156, 7.0498],
  'Benin City': [6.3350, 5.6037],
  'Kaduna': [10.5222, 7.4383],
  'Enugu': [6.4486, 7.5096]
  // Add more if needed
};

const RouteDisplay = ({ origin, destination }) => {
  const map = useMap();
  const [routeControl, setRouteControl] = useState(null);
  const mapLayersRef = useRef([]);
  const [selectedStationIndex, setSelectedStationIndex] = useState(null);

  const {
    setIsLoading,
    routeData,
    journeyProcessed,
    stationDataList, // Keep this for StationCard display
    setStationDataList // Keep this
  } = useContext(AppContext);

  // Fuel type is always Diesel
  const fuelType = 'Diesel';

  // Clean up all map elements
  const cleanupMap = () => {
    // Remove all layers we've added to the map
    mapLayersRef.current.forEach(layer => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
    // Clear the layers array
    mapLayersRef.current = [];

    // Clean up route control
    if (routeControl) {
      map.removeControl(routeControl);
      setRouteControl(null);
    }
    // Also try to remove all layers with a more brute-force approach
    map.eachLayer(layer => {
      // Don't remove the tile layer (base map)
      if (!(layer instanceof L.TileLayer)) {
        map.removeLayer(layer);
      }
    });
  };

  // Add a layer to the map and track it for cleanup
  const addLayerToMap = (layer) => {
    layer.addTo(map);
    mapLayersRef.current.push(layer);
    return layer;
  };

  useEffect(() => {
    // Clean up previous route elements before drawing new one
    cleanupMap();

    if (!origin || !destination || !journeyProcessed) return;

    // Get coordinates for origin and destination using Nigerian list
    const startPoint = depotCoordinates[origin] || depotCoordinates['Lagos']; // Default to Lagos
    const endPoint = depotCoordinates[destination] || depotCoordinates['Abuja']; // Default to Abuja

    // Create custom icon using the marker image from assets
    const customIcon = L.icon({
      iconUrl: markerImg,
      iconSize: [38, 38],
      iconAnchor: [19, 38],
      popupAnchor: [0, -38]
    });

    // Custom icon for fuel stations is always Diesel
    const fuelStationIcon = L.icon({
        iconUrl: dieselPumpImg,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      });

    // Create new markers and route line
    if (routeData && routeData.coordinates && routeData.coordinates.length > 0) {
      // If we have route coordinates from the API
      const routeCoordinates = routeData.coordinates.map(coord => L.latLng(coord[0], coord[1]));

      // Create a polyline for the route
      const routeLine = addLayerToMap(L.polyline(routeCoordinates, {
        color: '#6f42c1',
        weight: 6,
        opacity: 0.8
      }));

      // Add origin marker
      addLayerToMap(L.marker(routeCoordinates[0], { icon: customIcon, draggable: false })
        .bindPopup(`${origin} (Origin)`));

      // Add destination marker
      addLayerToMap(L.marker(routeCoordinates[routeCoordinates.length - 1], { icon: customIcon, draggable: false })
        .bindPopup(`${destination} (Destination)`));

      // Add fuel station markers if present (always Diesel)
      if (routeData.stations && routeData.stations.length > 0) {
        getStationLocationNames(routeData.stations)
          .then(stationsWithNames => {
            // Store station names in session storage
            try {
              sessionStorage.setItem('stationNames', JSON.stringify(
                stationsWithNames.map(station => station.stationName)
              ));
            } catch (e) { console.error("Error storing station names:", e); }

            // Add markers with actual location names
            stationsWithNames.forEach((station, index) => {
              // Basic check for valid station data structure
              if (!station || !station.coordinates || !Array.isArray(station.coordinates) || station.coordinates.length !== 2) {
                  console.warn(`Skipping invalid station data at index ${index}:`, station);
                  return; // Skip this iteration if data is invalid
              }
              const stationCoord = L.latLng(station.coordinates[0], station.coordinates[1]);
              const marker = L.marker(stationCoord, { icon: fuelStationIcon, draggable: false });

              // Add click handler to show single station card
              marker.on('click', () => {
                setSelectedStationIndex(index);
              });

              // Always Diesel station label, use derived name or fallback
              marker.bindPopup(`Diesel ${station.stationName || `Station ${index + 1}`}`);

              addLayerToMap(marker);
            });
          })
          .catch((error) => {
             console.error("Error processing station names, using fallback:", error);
             // Fallback only if getStationLocationNames rejects entirely
             routeData.stations.forEach((station, index) => {
                if (!station || !station.coordinates || !Array.isArray(station.coordinates) || station.coordinates.length !== 2) return;
                const stationCoord = L.latLng(station.coordinates[0], station.coordinates[1]);
                const marker = L.marker(stationCoord, { icon: fuelStationIcon, draggable: false });
                marker.on('click', () => { setSelectedStationIndex(index); });
                marker.bindPopup(`Diesel Station ${index + 1}`); // Simple fallback name
                addLayerToMap(marker);
             });
          });
      }
      // Fit map to route bounds
      map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

    } else {
      // Fallback to default routing if no API data (less likely scenario now)
      const newRouteControl = L.Routing.control({
        waypoints: [
          L.latLng(startPoint[0], startPoint[1]),
          L.latLng(endPoint[0], endPoint[1])
        ],
        routeWhileDragging: false,
        showAlternatives: false,
        lineOptions: {
          styles: [
            { color: '#6f42c1', opacity: 0.8, weight: 6 },
            { color: '#5e35b1', opacity: 0.9, weight: 4 } // Example secondary style
          ]
        },
        createMarker: function (i, waypoint, n) {
          // Use the custom marker for both origin and destination
          const marker = L.marker(waypoint.latLng, { icon: customIcon });
          // Add a popup to distinguish between origin and destination
          marker.bindPopup(i === 0 ? `${origin} (Origin)` : `${destination} (Destination)`);
          // Add to tracked layers (important for cleanup)
          mapLayersRef.current.push(marker);
          return marker;
        }
      }).addTo(map);

      // Add route calculation complete listener
      newRouteControl.on('routesfound', function (e) {
        // Route calculation complete, hide loading indicator
        setIsLoading(false);
      });

      // Hide the itinerary panel
      const container = newRouteControl.getContainer();
      if (container) {
        container.style.display = 'none';
      }
      setRouteControl(newRouteControl);

      // Fit map bounds to route
      const bounds = L.latLngBounds([startPoint, endPoint]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    // Clean up function on effect change
    return cleanupMap;
  }, [map, origin, destination, setIsLoading, routeData, journeyProcessed, setStationDataList]); // Dependencies

  // Close station card when clicking outside
  useEffect(() => {
    const handleMapClick = (e) => {
      if (!e.originalEvent) return; // Ignore internally triggered events
      const stationCardContainer = document.querySelector('.single-station-card-container'); // Target the container
      if (stationCardContainer && !stationCardContainer.contains(e.originalEvent.target)) {
        // Check if click was directly on the map (not on a marker)
        const markers = document.querySelectorAll('.leaflet-marker-icon');
        let clickedOnMarker = false;
        markers.forEach(marker => {
          if (marker.contains(e.originalEvent.target)) {
            clickedOnMarker = true;
          }
        });
        if (!clickedOnMarker) {
          setSelectedStationIndex(null); // Close card if click was on map, not marker
        }
      }
    };
    map.on('click', handleMapClick);
    // Clean up map event listener
    return () => {
      map.off('click', handleMapClick);
    };
  }, [map]); // Dependency on map object

  // Force cleanup when component unmounts completely
  useEffect(() => {
    return cleanupMap;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array means this runs once on mount and cleanup on unmount


  // Render the single station card if a station is selected
  return (
    <>
      {selectedStationIndex !== null && stationDataList && stationDataList[selectedStationIndex] && (
        <StationCard
          stationData={stationDataList[selectedStationIndex]}
          onClose={() => setSelectedStationIndex(null)}
        />
      )}
    </>
  );
};

export default RouteDisplay;