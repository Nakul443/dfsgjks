import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState, ErrorBox, Skeleton } from '../components/States'

describe('States components', () => {
  it('renders Skeleton with given height and aria-hidden', () => {
    const { container } = render(<Skeleton height="2rem" />)
    const skeleton = container.querySelector('.skeleton-loader') as HTMLElement
    expect(skeleton).toBeInTheDocument()
    expect(skeleton.style.height).toBe('2rem')
  })

  it('renders ErrorBox with title, message, and calls onRetry when clicked', () => {
    const onRetry = vi.fn()
    render(
      <ErrorBox
        title="Network Error"
        message="Backend connection timed out"
        onRetry={onRetry}
      />
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Network Error')).toBeInTheDocument()
    expect(
      screen.getByText('Backend connection timed out')
    ).toBeInTheDocument()

    const retryBtn = screen.getByRole('button', { name: /retry request/i })
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders EmptyState with icon and message', () => {
    render(
      <EmptyState
        title="No records"
        message="Please select an alternative range."
      />
    )

    expect(screen.getByText('No records')).toBeInTheDocument()
    expect(
      screen.getByText('Please select an alternative range.')
    ).toBeInTheDocument()
  })
})
