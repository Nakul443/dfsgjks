// this file is responsible for defining the Skeleton, ErrorBox, and EmptyState components used in the frontend application
// to provide visual feedback to users during data loading, error handling, and empty state scenarios
// in simple words,
// this file contains the code for the user interface that shows loading indicators, error messages, and empty state messages

import React from 'react'

export const Skeleton: React.FC<{
  height?: number | string
  width?: number | string
  className?: string
}> = ({ height = '1rem', width = '100%', className = '' }) => {
  return (
    <div
      className={`skeleton-loader ${className}`}
      style={{ height, width }}
      aria-hidden="true"
    />
  )
}

interface ErrorBoxProps {
  title?: string
  message?: string
  onRetry?: () => void
  className?: string
}

export const ErrorBox: React.FC<ErrorBoxProps> = ({
  title = 'Unable to load data',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div className={`error-box-container ${className}`} role="alert">
      <div className="error-box-header">
        <span className="error-icon" aria-hidden="true">⚠️</span>
        <h4>{title}</h4>
      </div>
      {message && <p className="error-box-message">{message}</p>}
      {onRetry && (
        <button type="button" className="retry-btn" onClick={onRetry}>
          ↻ Retry Request
        </button>
      )}
    </div>
  )
}

interface EmptyStateProps {
  title?: string
  message?: string
  action?: React.ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No data found',
  message = 'There is no data to display for the active selection.',
  action,
  className = '',
}) => {
  return (
    <div className={`empty-state-container ${className}`}>
      <span className="empty-icon" aria-hidden="true">📊</span>
      <h4>{title}</h4>
      <p>{message}</p>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}
