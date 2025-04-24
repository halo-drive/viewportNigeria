import React, { useContext } from 'react';
import { AppContext } from '../AppContext';
// Import icons (assuming these are generic enough)
import totalFuel from '../assets/totalFuel.png';
import totalOverhead from '../assets/totalOverhead.png';
import efficiency from '../assets/efficiency.png';
import consumption from '../assets/consumption.png';
import perMile from '../assets/perMile.png'; // Consider renaming/replacing icon if strictly 'per Km'

export default function FloatingCards() {
    const { journeyProcessed, analyticsData } = useContext(AppContext);

    // If journey isn't processed or no analytics data, don't render
    if (!journeyProcessed || !analyticsData) return null;

    const fuelType = 'Diesel'; // Hardcoded as Diesel

    // Define metric units for Nigeria
    const efficiencyUnit = 'km/L';    // Kilometers per Litre is a direct analogue to MPG
    const consumptionUnit = 'Litres'; // Use Litres for consumption volume

    // Create card data using analytics data, applying Nigerian context
    const cardData = [
        {
            id: 1,
            title: `Total Fuel Cost`,
            value: `₦${analyticsData.total_fuel_cost?.toFixed(2) || '0.00'}`, // Naira symbol, added safety for undefined/null
            icon: totalFuel,
            color: "#4e7aff"
        },
        {
            id: 2,
            title: "Fuel + Overhead Cost",
            value: `₦${analyticsData.total_final_cost?.toFixed(2) || '0.00'}`, // Naira symbol, added safety
            icon: totalOverhead,
            color: "#ff6b6b"
        },
        {
            id: 3,
            title: `Fuel Efficiency`,
            // Use efficiencyUnit (km/L). Ensure backend value for efficiency_prediction is appropriate.
            value: `${analyticsData.efficiency_prediction || 'N/A'} ${efficiencyUnit}`,
            icon: efficiency,
            color: "#4ecdc4"
        },
        {
            id: 4,
            title: `Fuel Consumption`,
            // Use consumptionUnit (Litres). Ensure backend value for total_required_fuel is in Litres.
            value: `${analyticsData.total_required_fuel?.toFixed(1) || 'N/A'} ${consumptionUnit}`,
            icon: consumption,
            color: "#ffbe0b"
        },
        {
            id: 5,
            title: "Cost per Km", // Changed title to reflect metric units
            // Use Naira symbol. IMPORTANT: Assumes backend key 'cost_per_mile' now holds cost per KM value.
            value: `₦${analyticsData.cost_per_km?.toFixed(2) || '0.00'}`,
            icon: perMile, // Icon might need changing to reflect "per Km"
            color: "#8a2be2"
            // Consider changing backend key to 'cost_per_km' for clarity.
        }
    ];

    return (
        <div className="floating-cards-container">
            {cardData.map(card => (
                <div
                    key={card.id}
                    className="floating-card"
                    style={{ borderTop: `3px solid ${card.color}` }}
                >
                    <div className="card-icon" style={{ backgroundColor: `${card.color}20` }}>
                        <img src={card.icon} alt={card.title} className="card-icon-img" />
                    </div>
                    <div className="card-content">
                        <h3 className="card-title">{card.title}</h3>
                        <p className="card-value">{card.value}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}