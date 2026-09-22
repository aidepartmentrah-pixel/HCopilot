import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SearchInput } from './SearchInput'

describe('SearchInput', () => {
  it('reports each keystroke via onChange', async () => {
    const onChange = vi.fn()
    render(<SearchInput value="" onChange={onChange} />)
    await userEvent.type(screen.getByRole('searchbox'), 'chen')
    expect(onChange).toHaveBeenCalledTimes(4)
    expect(onChange).toHaveBeenLastCalledWith('n')
  })

  it('shows a clear button only when there is a value, and clears on click', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<SearchInput value="" onChange={onChange} />)
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()

    rerender(<SearchInput value="chen" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onChange).toHaveBeenCalledWith('')
  })
})
