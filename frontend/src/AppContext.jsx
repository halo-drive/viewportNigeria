import { createContext, useState } from 'react';

export const AppContext = createContext(null);

// No direct changes needed here. The reset function already handles
// clearing potentially fuel-specific data like stationNames and currentFuelType.
export const AppProvider = ({ children }) => {
  const [journeyProcessed, setJourneyProcessed] = useState(false);
  const [selectedOrigin, setSelectedOrigin] = useState(null);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [activePane, setActivePane] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [energyData, setEnergyData] = useState(null); // Energy data (will hold diesel structure)
  const [stationDataList, setStationDataList] = useState([]); // Store station data list

  // Reset function to clear data when starting a new journey
  const resetJourneyData = () => {
    setJourneyProcessed(false);
    setSelectedOrigin(null);
    setSelectedDestination(null);
    setRouteData(null);
    setAnalyticsData(null);
    setEnergyData(null); // Clear energy data
    setStationDataList([]); // Also clear station data
    setActivePane(null); // Close any open panes
    setIsLoading(false); // Ensure loading is off


    // Clear relevant session storage
    try {
        sessionStorage.removeItem('currentFuelType'); // Although we only use Diesel, clear for consistency
        sessionStorage.removeItem('stationNames');
        sessionStorage.removeItem('lastFormData'); // Clear saved form
    } catch (e) {
        console.error("Error clearing session storage:", e);
    }

  };

  return (
    <AppContext.Provider value={{
      journeyProcessed,
      setJourneyProcessed,
      selectedOrigin,
      setSelectedOrigin,
      selectedDestination,
      setSelectedDestination,
      activePane,
      setActivePane,
      isLoading,
      setIsLoading,
      routeData,
      setRouteData,
      analyticsData,
      setAnalyticsData,
      energyData,
      setEnergyData,
      stationDataList,
      setStationDataList,
      resetJourneyData
    }}>
      {children}
    </AppContext.Provider>
  );
};