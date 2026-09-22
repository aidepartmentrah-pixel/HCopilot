import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Accordion, AccordionItem } from './Accordion'

function ControlledAccordion({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Accordion>
      <AccordionItem title="Section 1" open={open} onToggle={setOpen} disabled={disabled}>
        <p>Section body</p>
      </AccordionItem>
    </Accordion>
  )
}

describe('Accordion', () => {
  it('opens on click and reports the new state via onToggle', async () => {
    render(<ControlledAccordion />)
    const summary = screen.getByText('Section 1')
    expect(screen.getByText('Section body')).not.toBeVisible()

    await userEvent.click(summary)

    expect(screen.getByText('Section body')).toBeVisible()
  })

  it('does not open when disabled', async () => {
    render(<ControlledAccordion disabled />)
    const summary = screen.getByText('Section 1')

    await userEvent.click(summary)

    expect(screen.getByText('Section body')).not.toBeVisible()
  })
})
