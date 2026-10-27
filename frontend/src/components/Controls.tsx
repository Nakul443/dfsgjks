// this file is responsible for defining the Controls component used in the frontend application
// to allow users to select date ranges and decision cutoffs for querying wind data
// in simple words, this file contains the code for the user interface
// that lets users choose the time range and cutoff for wind data analysis

import React from 'react'
import {
  dateTimeLocalToIso,
  isoToDateTimeLocal,
  type DateRange,
  type PresetKey,
} from '../lib/range'

interface ControlsProps {
  range: DateRange
  window: DateRange
  cutoff: string
  errorMessage: string | null
  onRangeChange: (range: DateRange) => void
  onCutoffChange: (cutoff: string) => void
  onPresetSelect: (preset: PresetKey) => void
}

export const Controls: React.FC<ControlsProps> = ({
  range,
  window,
  cutoff,
  errorMessage,
  onRangeChange,
  onCutoffChange,
  onPresetSelect,
}) => {
  const minLocal = isoToDateTimeLocal(window.start)
  const maxLocal = isoToDateTimeLocal(window.end)
  const startLocal = isoToDateTimeLocal(range.start)
  const endLocal = isoToDateTimeLocal(range.end)

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val) {
      onRangeChange({
        ...range,
        start: dateTimeLocalToIso(val),
      })
    }
  }

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val) {
      onRangeChange({
        ...range,
        end: dateTimeLocalToIso(val),
      })
    }
  }

  const handleCutoffChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val) {
      onCutoffChange(val)
    }
  }

  return (
    <section className="controls-container" aria-label="Query Controls">
      <div className="controls-row">
        <div className="control-group">
          <label htmlFor="start-time-input">
            Start Time <span className="utc-badge">(UTC)</span>
          </label>
          <input
            id="start-time-input"
            type="datetime-local"
            step="1800"
            min={minLocal}
            max={maxLocal}
            value={startLocal}
            onChange={handleStartChange}
            aria-describedby={errorMessage ? 'range-error-msg' : undefined}
          />
        </div>

        <div className="control-group">
          <label htmlFor="end-time-input">
            End Time <span className="utc-badge">(UTC)</span>
          </label>
          <input
            id="end-time-input"
            type="datetime-local"
            step="1800"
            min={minLocal}
            max={maxLocal}
            value={endLocal}
            onChange={handleEndChange}
            aria-describedby={errorMessage ? 'range-error-msg' : undefined}
          />
        </div>

        <div className="control-group presets-group">
          <span className="control-label">Range Presets</span>
          <div className="preset-buttons" role="group" aria-label="Date Range Presets">
            <button
              type="button"
              className="preset-btn"
              onClick={() => onPresetSelect('1d')}
            >
              1 day
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => onPresetSelect('3d')}
            >
              3 days
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => onPresetSelect('7d')}
            >
              7 days
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => onPresetSelect('month')}
            >
              Full month
            </button>
          </div>
        </div>

        <div className="control-group cutoff-group">
          <label htmlFor="cutoff-time-input">
            Decision Cutoff <span className="utc-badge">(D-1, UTC)</span>
          </label>
          <input
            id="cutoff-time-input"
            type="time"
            step="60"
            value={cutoff}
            onChange={handleCutoffChange}
          />
        </div>
      </div>

      {errorMessage && (
        <div id="range-error-msg" className="control-error-banner" role="alert">
          <span className="error-icon">⚠️</span> {errorMessage}
        </div>
      )}
    </section>
  )
}
