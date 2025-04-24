import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../AppContext';

// Updated Label mapping for metric units (Nigeria)
const featureImportanceLabelMap = {
  'Distance_highway': 'Distance Highway (km)', // Changed unit
  'Distance_city': 'Distance City (km)',       // Changed unit
  'Avg_temp': 'Temperature (°C)',              // Added unit for clarity
  'dispatch_time': 'Dispatch Time',
  'Avg_traffic_congestion': 'Traffic Congestion',
  'Vehicle_age': 'Vehicle Age (Yrs)',          // Added unit for clarity
  'Avg_Speed_mph': 'Average Speed (kph)',     // Changed unit (assuming backend key stays same)
  'Goods_weight': 'Goods Weight (kg)',         // Added unit for clarity (assuming kg)
  'Avg_Precipitation': 'Precipitation',
  'Avg_snow': 'Snow Level',                    // Likely less relevant for Nigeria?
  'total_payload': 'Total Payload (kg)',       // Added unit for clarity (assuming kg)
};

// IMPORTANT: This assumes the backend data keys (e.g., 'Avg_Speed_mph') remain the same,
// but the *values* returned by the backend now represent kph, km etc.
// If backend keys change (e.g., to 'Avg_Speed_kph'), update the map keys above.

export default function AnalyticsChart() {
  const { analyticsData } = useContext(AppContext);
  const [featureData, setFeatureData] = useState([]);
  const [animate, setAnimate] = useState(false);

  // Function to get display label from the map or use the backend key
  const getDisplayLabel = (backendLabel) => {
    return featureImportanceLabelMap[backendLabel] || backendLabel.replace(/_/g, ' '); // Fallback: replace underscores
  };

  useEffect(() => {
    if (analyticsData && analyticsData.featureImportance && Array.isArray(analyticsData.featureImportance)) {
      // Ensure data is sorted by importance (value) descending, take top 8
      const sortedData = [...analyticsData.featureImportance]
          .sort((a, b) => b.value - a.value)
          .slice(0, 8); // Limit to top 8 features

      if (sortedData.length > 0) {
          const maxValue = sortedData[0].value; // Max value is the first item after sorting

          const formattedData = sortedData.map((item, i) => ({
            id: i + 1, // Use index as ID after sorting/slicing
            label: getDisplayLabel(item.name),
            value: Math.round(item.value), // Round the raw importance value
            // Scale value relative to the max importance *within the top 8*
            scaledValue: maxValue > 0 ? Math.round((item.value / maxValue) * 100) : 0,
            colorClass: `bar-color-${i + 1}` // Assign color based on rank
          }));
          setFeatureData(formattedData);
       } else {
           setFeatureData([]); // Handle empty feature importance list
       }

    } else {
      setFeatureData([]); // Reset if data is missing or not an array
    }

    // Reset and trigger animation
    setAnimate(false); // Reset animation state
    const timer = setTimeout(() => {
      setAnimate(true); // Trigger animation after a short delay
    }, 100);

    // Cleanup timer on unmount or re-render
    return () => clearTimeout(timer);
  }, [analyticsData]); // Re-run effect when analyticsData changes

  // Display loading message if data is not yet ready
  if (featureData.length === 0) {
    return <div className="analytics-chart">Loading feature importance data...</div>;
  }

  // Render the chart
  return (
    <div className="analytics-chart">
      {featureData.map((item, index) => (
        <div key={item.id} className="bar-row">
          <div className="bar-label" title={item.label}>{item.label}</div> {/* Added title attribute for long labels */}
          <div className="bar-container">
            <div
              className={`bar-fill ${item.colorClass}`}
              style={{
                width: animate ? `${item.scaledValue}%` : '0%', // Animate width
                transition: 'width 0.5s ease-out', // Add transition directly
                transitionDelay: `${index * 0.05}s` // Stagger animation start
              }}
            ></div>
          </div>
          <div className="bar-value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}