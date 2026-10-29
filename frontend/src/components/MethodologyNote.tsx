// this file is responsible for defining the MethodologyNote component used in the frontend application
// to provide users with detailed information about the methodology and domain context of the wind data analysis
// in simple words,
// this file contains the code for the user interface that explains how the wind forecasts are generated and evaluated

import React, { useState } from 'react'

export const MethodologyNote: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="methodology-card" aria-label="Methodology and Domain Notes">
      <button
        type="button"
        className="methodology-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="methodology-title">
          <span className="info-icon" aria-hidden="true">ℹ️</span> Methodology &amp; Domain Notes
        </span>
        <span className="toggle-indicator">{isOpen ? '▲ Hide' : '▼ View Details'}</span>
      </button>

      {isOpen && (
        <div className="methodology-content">
          <div className="methodology-grid">
            <div className="methodology-item">
              <h4>1. Decision-Time Forecast (WINDFOR)</h4>
              <p>
                In Great Britain day-ahead wholesale electricity trading, purchase commitments
                for delivery day <em>D</em> occur on <em>D-1</em> ahead of the daily gate closure.
                The forecast line displays the <strong>latest national wind generation forecast published prior to the decision cutoff</strong>,
                reflecting information genuinely accessible to the trading desk at commitment time.
              </p>
            </div>

            <div className="methodology-item">
              <h4>2. The 09:00 UTC Cutoff Assumption</h4>
              <p>
                The default cutoff time of <strong>09:00 UTC</strong> on <em>D-1</em> is an operational modeling assumption
                representing the morning desk auction workflow before Day-Ahead gate closure.
                Traders can adjust this cutoff in the header to simulate alternative decision windows.
              </p>
            </div>

            <div className="methodology-item">
              <h4>3. Hourly-to-Half-Hourly Carry-Forward</h4>
              <p>
                Elexon BMRS <code>WINDFOR</code> forecasts are published exclusively on hourly boundaries (<code>:00</code>).
                To align with Great Britain’s 48 half-hour settlement periods (<code>FUELHH</code>), each hourly forecast is carried
                forward to its corresponding <code>:30</code> slot preserving the identical <code>publish_time</code>.
              </p>
            </div>

            <div className="methodology-item">
              <h4>4. Error Calculation &amp; Metrics</h4>
              <p>
                <code>Error = Forecast − Actual</code>. Positive errors represent over-forecasting (less wind produced than expected);
                negative errors indicate under-forecasting.
                Metrics (MAE, RMSE, Bias, MAPE) evaluate non-null error rows. MAPE strictly excludes slots with 0 MW actual generation.
              </p>
            </div>

            <div className="methodology-item">
              <h4>5. Historical Planning Error Band</h4>
              <p>
                The shaded envelope represents the historical in-sample uncertainty band:
                <code>[max(0, Forecast − P90), Forecast − P10]</code>. Percentiles are derived from the
                <strong>entire January 2026 decision-time error distribution for the chosen cutoff</strong>,
                preventing zoom-dependent shifts or target-day data leakage.
              </p>
            </div>

            <div className="methodology-item">
              <h4>6. Data Sources &amp; Time Standard</h4>
              <p>
                All data is sourced directly from <strong>Elexon BMRS</strong> national streams:
                <code>FUELHH</code> (actual metered outturn by fuel type) and <code>WINDFOR</code> (wind generation forecasts).
                All timestamps are in <strong>UTC</strong>. In January, UTC coincides with UK local time (GMT).
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
