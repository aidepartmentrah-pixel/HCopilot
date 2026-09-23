import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AnalyticsCard } from './AnalyticsCard'

const DATA = [
  { label: '0-30 min', value: 40 },
  { label: '30-60 min', value: 12 },
]

describe('AnalyticsCard', () => {
  it('renders the title and summary line', () => {
    render(<AnalyticsCard title="Wait Time Distribution" summary="Avg 27.2 min · n=52" data={DATA} allowedViews={['bar']} defaultView="bar" />)
    expect(screen.getByText('Wait Time Distribution')).toBeInTheDocument()
    expect(screen.getByText('Avg 27.2 min · n=52')).toBeInTheDocument()
  })

  it('shows a loading state and hides the chart', () => {
    render(<AnalyticsCard title="Wait Time Distribution" data={DATA} allowedViews={['bar']} defaultView="bar" isLoading />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows a localized error without hiding the card title', () => {
    const onRetry = vi.fn()
    render(<AnalyticsCard title="Wait Time Distribution" data={[]} allowedViews={['bar']} defaultView="bar" isError onRetry={onRetry} />)
    expect(screen.getByText('Wait Time Distribution')).toBeInTheDocument()
    expect(screen.getByText('Wait Time Distribution unavailable')).toBeInTheDocument()
  })

  it('shows the empty message when every datum is zero, not a meaningless zero-bar chart', () => {
    render(
      <AnalyticsCard
        title="Wait Time Distribution"
        data={[{ label: '0-30 min', value: 0 }]}
        allowedViews={['bar']}
        defaultView="bar"
        emptyMessage="No data available for this period."
      />,
    )
    expect(screen.getByText('No data available for this period.')).toBeInTheDocument()
  })

  it('hides the chart-type switcher entirely when only one view is valid', () => {
    render(<AnalyticsCard title="Acuity Breakdown" data={DATA} allowedViews={['donut']} defaultView="donut" />)
    expect(screen.queryByRole('button', { name: /Change visualization/ })).not.toBeInTheDocument()
  })

  it('switches to Table view and shows exact values reusing the standard table', async () => {
    const user = userEvent.setup()
    render(<AnalyticsCard title="Wait Time Distribution" data={DATA} allowedViews={['bar', 'table']} defaultView="bar" total={52} />)
    await user.click(screen.getByRole('button', { name: /Change visualization/ }))
    await user.click(screen.getByRole('menuitem', { name: /Table/ }))
    expect(screen.getByRole('columnheader', { name: 'Label' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '0-30 min' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '40' })).toBeInTheDocument()
  })

  it('renders headerExtra (e.g. a dimension toggle) alongside the chart switcher', () => {
    render(
      <AnalyticsCard
        title="Patient Arrivals"
        data={DATA}
        allowedViews={['bar', 'table']}
        defaultView="bar"
        headerExtra={<span>Hour of Day</span>}
      />,
    )
    expect(screen.getByText('Hour of Day')).toBeInTheDocument()
  })
})
