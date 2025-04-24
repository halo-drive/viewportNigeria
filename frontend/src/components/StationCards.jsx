import React, { useEffect, useContext } from 'react';
import { AppContext } from '../AppContext';
import green from '../assets/green.png';
import red from '../assets/red.png';
import dieselPump from '../assets/diesel-pump.png';
// Removed hydrogen/electric icons
import FuelGauge from './FuelGauge'; // Assuming correct path
import './StationCards.css'; // Assuming correct path

const StationCards = ({ onClose }) => {
  const {
    routeData,
    journeyProcessed,
    stationDataList,
    setStationDataList,
    energyData,
    setEnergyData
  } = useContext(AppContext);

  // Set up click away listener to close cards
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside of station cards container and fuel card container
      const stationCardsContainer = document.querySelector('.station-cards-container');
      const fuelCardContainer = document.querySelector('.fuel-card-container');

      let clickedInside = false;
      if (stationCardsContainer && stationCardsContainer.contains(event.target)) {
        clickedInside = true;
      }
      if (fuelCardContainer && fuelCardContainer.contains(event.target)) {
        clickedInside = true;
      }

      // If click is outside both cards, call the onClose function
      if (!clickedInside) {
        onClose();
      }
    };

    // Add the event listener
    document.addEventListener('mousedown', handleClickOutside);

    // Clean up
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Fuel type is always Diesel
  const fuelType = 'Diesel';
  const stationIcon = dieselPump;

  // Generate energy data if it doesn't exist yet (Diesel only)
  useEffect(() => {
    if (journeyProcessed && (!energyData || !energyData.dieselLevel)) { // Check specifically for dieselLevel
      // Generate new random energy data for Diesel
      const randomDiesel = Math.floor(Math.random() * (1500 - 100 + 1)) + 100;

      // Create the energy data (ensure structure matches EnergyPanel)
      const newEnergyData = {
        dieselLevel: randomDiesel,
        // Re-add dieselStation structure if needed by EnergyPanel,
        // but StationCards itself doesn't seem to use it directly.
        // Check EnergyPanel's useEffect for the full structure if required.
        // For now, just setting the level needed by the gauge here.
      };

      // Merge with existing energyData if necessary, or just set it
      setEnergyData(prevData => ({ ...prevData, ...newEnergyData }));
    }
  }, [journeyProcessed, energyData, setEnergyData]);

  // Generate station data when route data changes (Diesel only)
  useEffect(() => {
    // Check if we have a new journey with stations and stationDataList is empty
    if (
      journeyProcessed &&
      routeData &&
      routeData.stations &&
      routeData.stations.length > 0 &&
      stationDataList.length === 0 // Only generate if list is empty for this journey
    ) {
      // Try to get station names from session storage
      let stationNames = [];
      try {
        const storedNames = sessionStorage.getItem('stationNames');
        if (storedNames) {
          stationNames = JSON.parse(storedNames);
        }
      } catch (e) {
        console.error("Error reading station names:", e);
      }

      // Generate data for each Diesel station
      const newStationDataList = routeData.stations.map((station, index) => {
        // Get station name or use default
        const stationName = stationNames[index] || `Diesel Station ${index + 1}`;

        // Random available filling points (2-6)
        const availablePoints = Math.floor(Math.random() * (6 - 2 + 1)) + 2;
        // Random total fuel amount (10000-24000 L)
        const totalFuel = Math.floor(Math.random() * (24000 - 10000 + 1)) + 10000;

        return {
          name: stationName,
          availablePoints: availablePoints,
          totalPoints: 8,
          totalFuel: totalFuel
        };
      });

      // Save the generated data to context to persist it
      setStationDataList(newStationDataList);
    }
  }, [routeData, journeyProcessed, setStationDataList, stationDataList.length]); // Added dependencies


  // Return early if no data or energy data isn't ready
  if (!journeyProcessed || stationDataList.length === 0 || !energyData || typeof energyData.dieselLevel === 'undefined') {
     // Optionally show a loading state or just null
     // console.log("StationCards: Waiting for data", { journeyProcessed, stationDataList, energyData });
     return null;
  }

  return (
    <>
      <div className="station-cards-container">
        {stationDataList.map((stationData, index) => (
          <div key={index} className="station-card">
            <div className="station-card-header">
              <img
                src={stationIcon}
                alt={fuelType}
                className="station-card-icon"
              />
              <h3 className="station-card-title">{stationData.name}</h3>
            </div>

            {/* Always display Diesel station details */}
            <div className="station-display">
              <div className="detail-item total-fuel">
                <span className="detail-label">Total Fuel:</span>
                <span className="detail-value">{stationData.totalFuel} Litres</span>
              </div>
              <div className="filling-points">
                <div className="filling-points-row">
                  {[...Array(4)].map((_, i) => (
                    <img
                      key={`row1-${i}`}
                      src={i < Math.min(stationData.availablePoints, 4) ? green : red}
                      alt={i < stationData.availablePoints ? "Available" : "Occupied"}
                      className="filling-point-icon"
                    />
                  ))}
                </div>
                <div className="filling-points-row">
                  {[...Array(4)].map((_, i) => (
                    <img
                      key={`row2-${i}`}
                      src={i + 4 < stationData.availablePoints ? green : red}
                      alt={i + 4 < stationData.availablePoints ? "Available" : "Occupied"}
                      className="filling-point-icon"
                    />
                  ))}
                </div>
                <div className="filling-status">
                  <span className="available-count">{stationData.availablePoints} Free</span>
                  <span className="occupied-count">{stationData.totalPoints - stationData.availablePoints} Used</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Fuel Card at the bottom of the screen (Always Diesel) */}
      <div className="fuel-card-container">
        <div className="fuel-card">
          {/* Fuel Gauge */}
          <FuelGauge
            value={energyData.dieselLevel}
            maxValue={1500} // Diesel max value
            type={fuelType} // Diesel type
          />

          {/* Value display with icon to the left */}
          <div className="fuel-value-container">
            <img
              src={stationIcon} // Diesel icon
              alt={fuelType}
              className="fuel-value-icon"
            />
            <div className="fuel-value-text">
              {`${energyData.dieselLevel} Litres`} {/* Diesel value and unit */}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default StationCards;