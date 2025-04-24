import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../AppContext';
import dieselPump from '../assets/diesel-pump.png';
// Removed hydrogen and electric specific imports
import green from '../assets/green.png';
import red from '../assets/red.png';

export default function EnergyPanel() {
  // Get AppContext for storing persistent data
  const { routeData, journeyProcessed, energyData, setEnergyData } = useContext(AppContext);

  // Journey fuel type is always Diesel now
  const journeyFuelType = 'Diesel';

  // Generate or retrieve energy data
  useEffect(() => {
    // Check if we already have energy data for the current journey
    if (!energyData || !Object.keys(energyData).length) {
      // Try to get station names from session storage
      let stationNames = [];
      try {
        const storedNames = sessionStorage.getItem('stationNames');
        if (storedNames) {
          stationNames = JSON.parse(storedNames);
          console.log("Retrieved station names:", stationNames);
        }
      } catch (e) {
        console.error("Error reading station names:", e);
      }

      // Default station name if none found
      const dieselStationName = stationNames.length > 0 ? stationNames[0] : 'Central Depot Station';

      // No data exists yet - generate new random data for Diesel
      // Random diesel level (100-1500 L)
      const randomDiesel = Math.floor(Math.random() * (1500 - 100 + 1)) + 100;

      // Random available filling points (2-6)
      const availablePoints = Math.floor(Math.random() * (6 - 2 + 1)) + 2;

      // Create and store the energy data (Diesel only)
      const newEnergyData = {
        dieselLevel: randomDiesel,
        dieselStation: {
          name: dieselStationName,
          availablePoints: availablePoints,
          totalPoints: 8
        },
        // Removed hydrogen and electric data
      };

      // Store in context for persistence
      setEnergyData(newEnergyData);
    }
  }, [energyData, setEnergyData, journeyProcessed]); // Added journeyProcessed dependency

  // Helper function to get color for fuel level bar
  const getFuelBarColor = (level, max) => {
    const percentage = level / max;

    if (percentage < 0.3) return '#e74c3c'; // Red for low
    if (percentage < 0.6) return '#f39c12'; // Orange for medium
    return '#2ecc71'; // Green for high
  };

  // If we don't have energy data yet, show loading
  if (!energyData) {
    return <div>Loading energy data...</div>;
  }

  return (
    <div className="energy-panel">
      {/* Fuel Section - Always Diesel */}
      <div className="energy-section">
        <h3 className="section-title">Fuel</h3>
        <div className="fuel-display">
          <div className="fuel-icon-container">
            <img src={dieselPump} alt="Diesel" className="fuel-icon" />
          </div>
          <div className="fuel-bar-container">
            <div
              className="fuel-bar-fill"
              style={{
                width: `${(energyData.dieselLevel / 1500) * 100}%`,
                backgroundColor: getFuelBarColor(energyData.dieselLevel, 1500)
              }}
            ></div>
          </div>
          <div className="fuel-value">{energyData.dieselLevel} Litres</div>
        </div>
      </div>

      {/* Stations Section - Always Diesel */}
      <div className="energy-section">
        <h3 className="section-title">Station</h3>
        <div className="station-display">
          <h4 className="station-name">{energyData.dieselStation.name}</h4>
          <div className="filling-points">
            <div className="filling-points-row">
              {[...Array(4)].map((_, index) => (
                <img
                  key={`row1-${index}`}
                  src={index < Math.min(energyData.dieselStation.availablePoints, 4) ? green : red}
                  alt={index < energyData.dieselStation.availablePoints ? "Available" : "Occupied"}
                  className="filling-point-icon"
                />
              ))}
            </div>
            <div className="filling-points-row">
              {[...Array(4)].map((_, index) => (
                <img
                  key={`row2-${index}`}
                  src={index + 4 < energyData.dieselStation.availablePoints ? green : red}
                  alt={index + 4 < energyData.dieselStation.availablePoints ? "Available" : "Occupied"}
                  className="filling-point-icon"
                />
              ))}
            </div>
            <div className="filling-status">
              <span className="available-count">{energyData.dieselStation.availablePoints} Available</span>
              <span className="occupied-count">{energyData.dieselStation.totalPoints - energyData.dieselStation.availablePoints} Occupied</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}