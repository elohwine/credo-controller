import { useEffect, useState } from 'react'
import { Button, Group, NumberInput, Stack, Text } from '@mantine/core'

import { quoteTotal, type QuoteLine } from '../../../src/config/jobSheet'

import type { OperationsApi, RateCard } from './operationsApi'

/** Turns the office rate card into one amount for the client price. */
export function RateCardPicker({
  api,
  onUse,
}: {
  api: OperationsApi | null
  onUse: (amount: number, currency: string) => void
}) {
  const [cards, setCards] = useState<RateCard[]>([])
  const [qty, setQty] = useState<Record<string, number | string>>({})

  useEffect(() => {
    if (!api) return
    api.rateCards().then(setCards).catch(() => setCards([]))
  }, [api])

  if (!api || cards.length === 0) return null
  const lines: QuoteLine[] = cards
    .filter((card) => Number(qty[card.id]) > 0)
    .map((card) => ({ description: card.name, quantity: Number(qty[card.id]), unitPrice: card.unitPrice }))
  const total = quoteTotal(lines)
  const currency = cards[0]?.currency || 'USD'

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        Build the price from the rate card
      </Text>
      {cards.map((card) => (
        <Group key={card.id} justify="space-between" wrap="nowrap">
          <Text size="sm" style={{ flex: 1 }}>
            {card.name} · {card.currency} {card.unitPrice.toFixed(2)} / {card.unit}
          </Text>
          <NumberInput
            aria-label={`Quantity of ${card.name}`}
            w={90}
            min={0}
            value={qty[card.id] ?? ''}
            onChange={(value) => setQty({ ...qty, [card.id]: value })}
          />
        </Group>
      ))}
      {total > 0 && (
        <Group justify="space-between">
          <Text size="sm">Total {currency} {total.toFixed(2)}</Text>
          <Button size="sm" radius="xl" variant="light" onClick={() => onUse(total, currency)}>
            Use this amount
          </Button>
        </Group>
      )}
    </Stack>
  )
}
