import React from 'react'
import { Grid, Select, TextInput } from '@mantine/core'

export interface JobPaymentPlan {
  paymentTerms: string
  instalments: string
  paymentCadence: string
  firstDueDate: string
  firstPaymentAmount: string
}

/** The plan fields sent with a job's price (new job and "Set price and payment"). */
export function jobPaymentPlanBody(plan: JobPaymentPlan): Record<string, unknown> {
  return {
    paymentTerms: plan.paymentTerms,
    ...(plan.paymentTerms !== 'one_time'
      ? {
          instalments: Math.max(2, parseInt(plan.instalments, 10) || 2),
          paymentCadence: plan.paymentCadence,
          firstDueDate: plan.firstDueDate,
          ...(Number(plan.firstPaymentAmount) > 0 ? { firstPaymentAmount: Number(plan.firstPaymentAmount) } : {}),
        }
      : {}),
  }
}

/** "How will the client pay?" and, for a plan, how many payments and when. Same words as the website. */
export default function JobPaymentPlanFields({
  value,
  onChange,
}: {
  value: JobPaymentPlan
  onChange: (next: JobPaymentPlan) => void
}) {
  return (
    <>
      <Select
        label="How will the client pay?"
        description="The job can close after sign-off while later payments remain in Finance."
        data={[
          { value: 'one_time', label: 'One payment' },
          { value: 'instalment', label: 'A fixed number of instalments' },
          { value: 'recurring', label: 'Recurring payments' },
        ]}
        value={value.paymentTerms}
        onChange={(paymentTerms) => onChange({ ...value, paymentTerms: paymentTerms || 'one_time' })}
      />
      {value.paymentTerms !== 'one_time' && (
        <Grid gutter="sm">
          <Grid.Col span={4}>
            <TextInput
              label="Payments"
              type="number"
              min={2}
              value={value.instalments}
              onChange={(e) => onChange({ ...value, instalments: e.currentTarget.value })}
            />
          </Grid.Col>
          <Grid.Col span={8}>
            <Select
              label="How often"
              data={[
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Every three months' },
              ]}
              value={value.paymentCadence}
              onChange={(paymentCadence) => onChange({ ...value, paymentCadence: paymentCadence || 'monthly' })}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput
              label="First payment due"
              type="date"
              value={value.firstDueDate}
              onChange={(e) => onChange({ ...value, firstDueDate: e.currentTarget.value })}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput
              label="First payment amount (optional)"
              type="number"
              min={0}
              value={value.firstPaymentAmount}
              onChange={(e) => onChange({ ...value, firstPaymentAmount: e.currentTarget.value })}
            />
          </Grid.Col>
        </Grid>
      )}
    </>
  )
}
