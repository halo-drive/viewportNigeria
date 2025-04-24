import { useContext } from 'react';
import { AppContext } from '../AppContext';
import AnalyticsChart from './AnalyticsChart'; // Assuming correct path

// Import icons (assuming these are generic enough)
import goods from "../assets/goods.png";
import insurance from "../assets/insurance.png";
import fuel from "../assets/fuel.png";
import overhead from "../assets/overhead.png";
import temperature from "../assets/temperature.png";
import precipitation from "../assets/precipitation.png";
import snow from "../assets/snow.png";
import highway from "../assets/highway.png";
import city from "../assets/city.png";
import cross from "../assets/cross.png";
import check from "../assets/check.png";
import time from "../assets/time.png";
import StartForm from './StartForm'; // Assuming correct path

export default function SlidingPanel() {
  const { activePane, analyticsData } = useContext(AppContext);

  // Don't render if no active pane or if it's the energy pane (handled elsewhere)
  if (!activePane || activePane === "energy") return null;

  return (
    <div className={`sliding-pane ${activePane === "analytics" ? "analytics-pane" : ""} ${activePane === "start" ? "start-pane" : ""}`}>
      <div className="pane-header">
        <h1>{activePane.charAt(0).toUpperCase() + activePane.slice(1)}</h1> {/* Capitalize pane name */}
      </div>
      <div className="pane-content">

        {/* Start Pane Content */}
        {activePane === "start" && (
          <div className="start-container">
            <StartForm />
          </div>
        )}

        {/* Cost Pane Content */}
        {activePane === "cost" && analyticsData && ( // Ensure analyticsData exists
          <div className="cost-container">
              <div className="cost-item">
                  <span className="cost-label">Goods Value:</span>
                  <img src={goods} alt="Goods" className="cost-icon" />
                  {/* Naira symbol, added safety */}
                  <span className="cost-value">₦{analyticsData.good_value_fuel?.toFixed(2) || "--"}</span>
              </div>
              <div className="cost-item">
                  <span className="cost-label">Insurance Cost:</span>
                  <img src={insurance} alt="Insurance" className="cost-icon" />
                   {/* Naira symbol, added safety */}
                  <span className="cost-value">₦{analyticsData.insurance_fuel_cost?.toFixed(2) || "--"}</span>
              </div>
              <div className="cost-item">
                  <span className="cost-label">Fuel Cost:</span>
                  <img src={fuel} alt="Fuel" className="cost-icon" />
                   {/* Naira symbol, added safety */}
                  <span className="cost-value">₦{analyticsData.total_fuel_cost?.toFixed(2) || "--"}</span>
              </div>
              <div className="cost-item">
                  <span className="cost-label">Overhead Cost:</span>
                  <img src={overhead} alt="Overhead" className="cost-icon" />
                   {/* Naira symbol, added safety */}
                  <span className="cost-value">₦{analyticsData.overhead_cost?.toFixed(2) || "--"}</span>
              </div>
          </div>
        )}
        {activePane === "cost" && !analyticsData && (
            <div>Loading cost data...</div> // Show loading if pane active but data not ready
        )}


        {/* Journey Pane Content */}
        {activePane === "journey" && analyticsData && ( // Ensure analyticsData exists
          <div className="journey-container">
              <div className="journey-item">
                  <span className="journey-label">Avg. Temp.:</span>
                  <img src={temperature} alt="Temperature" className="journey-icon" />
                  {/* Added safety */}
                  <span className="journey-value">{analyticsData.average_temperature ? `${analyticsData.average_temperature}°C` : "--"}</span>
              </div>
              <div className="journey-item">
                  <span className="journey-label">Avg. Precipitation:</span>
                  <img src={precipitation} alt="Precipitation" className="journey-icon" />
                   {/* Added safety */}
                  <span className="journey-value">{analyticsData.rain_classification || "--"}</span>
              </div>
              <div className="journey-item">
                  <span className="journey-label">Avg. Snow:</span>
                  <img src={snow} alt="Snow" className="journey-icon" />
                  {/* Added safety */}
                  <span className="journey-value">{analyticsData.snow_classification || "--"}</span>
              </div>
              <div className="journey-item">
                  <span className="journey-label">Highway:</span>
                  <img src={highway} alt="Highway" className="journey-icon" />
                   {/* Changed unit to km, added safety */}
                  <span className="journey-value">{analyticsData.highway_distance ? `${analyticsData.highway_distance} km` : "--"}</span>
              </div>
              <div className="journey-item">
                  <span className="journey-label">City:</span>
                  <img src={city} alt="City" className="journey-icon" />
                   {/* Changed unit to km, added safety */}
                  <span className="journey-value">{analyticsData.city_distance ? `${analyticsData.city_distance} km` : "--"}</span>
              </div>
          </div>
        )}
         {activePane === "journey" && !analyticsData && (
            <div>Loading journey data...</div> // Show loading if pane active but data not ready
        )}


        {/* Fleet Pane Content */}
        {activePane === "fleet" && analyticsData && ( // Ensure analyticsData exists
            <div className="fleet-container">
                <div className="fleet-item">
                    <span className="fleet-label">Goods Secured:</span>
                    <span className="fleet-value">
                        <img src={analyticsData.is_goods_secured === '✔️' ? check : cross} alt="Status" className="status-icon" />
                    </span>
                </div>
                <div className="fleet-item">
                    <span className="fleet-label">Safety Check:</span>
                    <span className="fleet-value">
                        <img src={analyticsData.check_safety === '✔️' ? check : cross} alt="Status" className="status-icon" />
                    </span>
                </div>
                <div className="fleet-item">
                    <span className="fleet-label">Loading Time:</span>
                    <img src={time} alt="time" className="fleet-icon" />
                     {/* Added safety */}
                    <span className="fleet-value">{analyticsData.goods_loading_time ? `${analyticsData.goods_loading_time} mins` : "--"}</span>
                </div>
            </div>
        )}
         {activePane === "fleet" && !analyticsData && (
            <div>Loading fleet data...</div> // Show loading if pane active but data not ready
        )}


        {/* Analytics Pane Content */}
        {activePane === "analytics" && (
          <div>
            <p className="analytics-header">Top 8 Features by Importance</p>
            <AnalyticsChart /> {/* Analytics chart handles its own loading */}
          </div>
        )}

      </div>
    </div>
  );
}