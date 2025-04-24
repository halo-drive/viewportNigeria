import React, { useEffect } from 'react';
import green from '../assets/green.png';
import red from '../assets/red.png';
import dieselPump from '../assets/diesel-pump.png';
// Removed hydrogen/electric pump icons
import './StationCards.css'; // Ensure path is correct

// Single station card component - Now only shows Diesel info
const StationCard = ({ stationData, onClose }) => {

  // Fuel type is always Diesel
  const fuelType = 'Diesel';
  const stationIcon = dieselPump;

  // Set up click away listener to close card
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside of the station card container
      const stationCardContainer = document.querySelector('.single-station-card-container');
      if (stationCardContainer && !stationCardContainer.contains(event.target)) {
        // If click is outside, call the onClose function
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

  if (!stationData) return null;

  return (
    // Added a container for positioning if needed
    <div className="single-station-card-container">
      <div className="single-station-card station-card"> {/* Reused station-card class */}
        <div className="station-card-header">
          <img
            src={stationIcon}
            alt={fuelType}
            className="station-card-icon"
          />
          <h3 className="station-card-title">{stationData.name}</h3>
        </div>

        {/* Always show Diesel details */}
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
    </div>
  );
};

export default StationCard;