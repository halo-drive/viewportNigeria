import React, { useState, useContext } from 'react';
import { AppContext } from '../AppContext';
import api from '../services/api';
import { AuthContext } from '../AuthContext';

export default function StartForm() {
  const {
    setJourneyProcessed,
    setSelectedOrigin,
    setSelectedDestination,
    setActivePane,
    setIsLoading,
    setRouteData,
    setAnalyticsData,
    setEnergyData,
    setStationDataList,
    resetJourneyData
  } = useContext(AppContext);

  const { logout } = useContext(AuthContext);

  // Helper function to get tomorrow's date
  function getTomorrowDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }

  // Helper function to format date as YYYY-MM-DD
  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Nigerian Depots/Cities
  const depots = [
    'Lagos', 'Abuja', 'Kano', 'Ibadan',
    'Port Harcourt', 'Benin City', 'Kaduna', 'Enugu'
  ];

  // Nigerian Truck Models (Selection)
  const dieselVehicles = [
    "Mercedes-Benz Actros 2645", // Start with a default
    "SINOTRUK HOWO A7",
    "IVECO Stralis",
    "DAF XF 530",
    "MAN TGS 26.440",
    "TATA Prima 4928.S",
    "SCANIA R 450",
    "Volvo FH 520",
    "MACK Granite" // Added Mack as per list
  ];

  // Function to get default form data with Nigerian context
  const getDefaultFormData = () => ({
    fuelType: 'Diesel', // Fixed to Diesel
    pallets: 20,
    vehicleModel: dieselVehicles[0], // Default to first in Nigerian list
    originDepot: depots[0],       // Default to first Nigerian city
    destinationDepot: depots[1],  // Default to second Nigerian city
    vehicleAge: 3,
    fuelAtOrigin: 20, // Kept this field, assuming backend might use it
    dispatchTime: '12:00:00',
    journeyDate: getTomorrowDate()
  });

  // Initialize form state, attempting to load saved data but ensuring Nigerian context
  const [formData, setFormData] = useState(() => {
    try {
      const savedData = sessionStorage.getItem('lastFormData');
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        // Validate saved data against current lists and ensure fuel type is Diesel
        const validOrigin = depots.includes(parsedData.originDepot) ? parsedData.originDepot : depots[0];
        const validDestination = depots.includes(parsedData.destinationDepot) && parsedData.destinationDepot !== validOrigin ? parsedData.destinationDepot : depots.find(d => d !== validOrigin) || depots[1];
        const validModel = dieselVehicles.includes(parsedData.vehicleModel) ? parsedData.vehicleModel : dieselVehicles[0];

        return {
             ...getDefaultFormData(), // Start with Nigerian defaults
             ...parsedData,           // Override with saved data values IF THEY EXIST (pallets, age etc)
             fuelType: 'Diesel',     // Force Diesel
             originDepot: validOrigin, // Use validated/default origin
             destinationDepot: validDestination, // Use validated/default destination
             vehicleModel: validModel,   // Use validated/default model
             // Ensure date/time are potentially updated if needed, or keep saved
             journeyDate: parsedData.journeyDate || getTomorrowDate(),
             dispatchTime: parsedData.dispatchTime || '12:00:00'
         };
      }
    } catch (e) {
      console.error("Error reading or parsing saved form data:", e);
    }
    // Fall back to pure defaults if load fails
    return getDefaultFormData();
  });

  const [error, setError] = useState('');

  // Get upcoming dates for the journey date dropdown
  function getUpcomingDates() {
    const dates = [];
    for (let i = 1; i <= 4; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      dates.push({
        value: formatDate(date),
        label: formatDate(date)
      });
    }
    return dates;
  }

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));

    // If origin depot changes, ensure destination is different
    if (name === 'originDepot') {
      if (value === formData.destinationDepot) {
        // Find the first available different depot
        const newDestination = depots.find(d => d !== value) || depots[1];
        setFormData(prevData => ({
          ...prevData,
          originDepot: value,
          destinationDepot: newDestination
        }));
      } else {
         setFormData(prevData => ({ ...prevData, originDepot: value }));
      }
    } else {
        setFormData(prevData => ({ ...prevData, [name]: value }));
    }
  };


  // Handle form reset
   const handleReset = () => {
    // Use the centralized reset function from context first
    resetJourneyData(); // This clears context state and session storage

    // Reset the local form state to defaults
    setFormData(getDefaultFormData());
    setError(''); // Clear any previous errors

    // Optional: Force map clear if needed, though resetJourneyData should handle routeData=null
    // setIsLoading(true);
    // setTimeout(() => setIsLoading(false), 100);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Simple validation
    if (formData.originDepot === formData.destinationDepot) {
        setError('Origin and Destination depots cannot be the same.');
        return; // Stop submission
    }

    // Clear previous results and show loading
    setStationDataList([]);
    setEnergyData(null); // Make sure previous energy data is cleared
    setIsLoading(true);
    setActivePane(null); // Close the start pane

    // Persist current submission attempt to session storage
    try {
        sessionStorage.setItem('currentFuelType', 'Diesel'); // Store fuel type (always Diesel)
        sessionStorage.setItem('lastFormData', JSON.stringify({ ...formData, fuelType: 'Diesel' }));
    } catch (err) {
        console.error("Error storing form data:", err);
    }

    try {
      // Prepare data for API
      const apiFormData = new FormData();
      apiFormData.append('pallets', formData.pallets);
      apiFormData.append('vehicleModel', formData.vehicleModel);
      apiFormData.append('originDepot', formData.originDepot);
      apiFormData.append('destinationDepot', formData.destinationDepot);
      apiFormData.append('vehicleAge', formData.vehicleAge);
      apiFormData.append('dispatchTime', formData.dispatchTime);
      apiFormData.append('journeyDate', formData.journeyDate);
      apiFormData.append('fuelAtOrigin', formData.fuelAtOrigin);

      // Call the Diesel API endpoint
      const result = await api.calculateDieselRoute(apiFormData);

      if (result.success) {
        // Update context with results
        setRouteData(result.route);
        setAnalyticsData(result.analytics);
        setSelectedOrigin(formData.originDepot);
        setSelectedDestination(formData.destinationDepot);
        setJourneyProcessed(true); // Mark journey as processed
      } else {
        // Handle API error reported from backend
        setError(result.error || 'An error occurred processing your request.');
        // Optionally reset context if API fails predictably
        // resetJourneyData();
        // setFormData(getDefaultFormData());
      }
    } catch (error) {
      // Handle network or other fetch errors
      console.error('Error submitting form:', error);
      setError('Failed to connect to the server or process the request. Please try again.');
       // Consider resetting context on major failure
       // resetJourneyData();
       // setFormData(getDefaultFormData());
    } finally {
      // Hide loading state regardless of outcome
      setIsLoading(false);
    }
  };


  return (
    <form className="start-form" onSubmit={handleSubmit}>
      {error && <div className="form-error">{error}</div>}

      {/* Fuel Type Display (Fixed & Styled) */}
      <div className="form-group">
         <label>Fuel Type:</label>
         <div className="fuel-type-display">
             <div
               className="fuel-btn active"
               style={{ marginLeft: '8px' }} // Keep margin for spacing
             >
                 Diesel
             </div>
         </div>
      </div>

      {/* Pallets Input */}
      <div className="form-group">
        <label htmlFor="pallets">Number of Pallets:</label>
        <input
          type="number"
          id="pallets"
          name="pallets"
          min="1"
          value={formData.pallets}
          onChange={handleChange}
          required
        />
      </div>

      {/* Vehicle Model Dropdown (Nigerian Models) */}
      <div className="form-group">
        <label htmlFor="vehicleModel">Vehicle Model:</label>
        <select
          id="vehicleModel"
          name="vehicleModel"
          value={formData.vehicleModel}
          onChange={handleChange}
          required
        >
          {dieselVehicles.map(model => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
      </div>

      {/* Origin Depot Dropdown (Nigerian Cities) */}
      <div className="form-group">
        <label htmlFor="originDepot">Origin Depot:</label>
        <select
          id="originDepot"
          name="originDepot"
          value={formData.originDepot}
          onChange={handleChange}
          required
        >
          {depots.map(depot => (
              <option key={depot} value={depot}>{depot}</option>
          ))}
        </select>
      </div>

      {/* Destination Depot Dropdown (Nigerian Cities - Filtered) */}
      <div className="form-group">
        <label htmlFor="destinationDepot">Destination Depot:</label>
        <select
          id="destinationDepot"
          name="destinationDepot"
          value={formData.destinationDepot}
          onChange={handleChange}
          required
        >
          {/* Ensure the selected origin is not an option */}
          {depots
             .filter(depot => depot !== formData.originDepot)
             .map(depot => (
               <option key={depot} value={depot}>{depot}</option>
          ))}
        </select>
      </div>

       {/* Vehicle Age Input */}
       <div className="form-group">
        <label htmlFor="vehicleAge">Vehicle Age (Years):</label>
        <input
          type="number"
          id="vehicleAge"
          name="vehicleAge"
          min="0"
          value={formData.vehicleAge}
          onChange={handleChange}
          required
        />
      </div>

      {/* Fuel at Origin Input */}
      <div className="form-group">
        {/* Updated label to reflect likely unit */}
        <label htmlFor="fuelAtOrigin">Fuel at Origin (Litres):</label>
        <input
          type="number"
          id="fuelAtOrigin"
          name="fuelAtOrigin"
          min="0"
          value={formData.fuelAtOrigin}
          onChange={handleChange}
          required
        />
      </div>

      {/* Dispatch Time Input */}
      <div className="form-group">
        <label htmlFor="dispatchTime">Dispatch Time Window:</label>
        <input
          type="time"
          id="dispatchTime"
          name="dispatchTime"
          step="1" // Keep step="1" for seconds precision if needed
          value={formData.dispatchTime}
          onChange={handleChange}
          required
        />
      </div>

      {/* Journey Date Input */}
      <div className="form-group">
        <label htmlFor="journeyDate">Journey Date:</label>
        <select
          id="journeyDate"
          name="journeyDate"
          value={formData.journeyDate}
          onChange={handleChange}
          required
        >
          {getUpcomingDates().map(date => (
            <option key={date.value} value={date.value}>{date.label}</option>
          ))}
        </select>
      </div>

      {/* Action Buttons */}
      <div className="form-buttons">
        <button type="submit" className="submit-btn">Process</button>
        <button type="button" className="reset-btn" onClick={handleReset}>New Query</button>
        <button type="button" className="logout-btn" onClick={logout}>Logout</button>
      </div>
    </form>
  );
}