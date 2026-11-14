import React from 'react'
import { Group, NumberInput, Select, TextInput } from '@mantine/core'

export interface JobPaymentPlan {
  paymentTerms: string
  instalments: number | string
  paymentCadence: string
  firstDueDate: string
  firstPaymentAmount: number | string
}

export const DEFAULT_JOB_PAYMENT_PLAN: JobPaymentPlan = {
  paymentTerms: 'one_time',
  instalments: 2,
  paymentCadence: 'monthly',
  firstDueDate: new Date().toISOString().slice(0, 10),
  firstPaymentAmount: '',
}

/** The plan fields sent with a job's price (new job and "Set price and payment"). */
export function jobPaymentPlanBody(plan: JobPaymentPlan): Record<string, unknown> {
  return {
    paymentTerms: plan.paymentTerms,
    ...(plan.paymentTerms !== 'one_time'
      ? {
          instalments: Number(plan.instalments) || 2,
          paymentCadence: plan.paymentCadence,
          firstDueDate: plan.firstDueDate,
          ...(Number(plan.firstPaymentAmount) > 0 ? { firstPaymentAmount: Number(plan.firstPaymentAmount) } : {}),
        }
      : {}),
  }
}

/** "How will the client pay?" and, for a plan, how many payments and when. */
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
        <Group grow>
          <NumberInput
            label="Number of payments"
            min={2}
            max={60}
            value={value.instalments}
            onChange={(instalments) => onChange({ ...value, instalments })}
          />
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
          <TextInput
            type="date"
            label="First payment due"
            value={value.firstDueDate}
            onChange={(e) => onChange({ ...value, firstDueDate: e.currentTarget.value })}
          />
          <NumberInput
            label="First payment amount (optional)"
            min={0}
            value={value.firstPaymentAmount}
            onChange={(firstPaymentAmount) => onChange({ ...value, firstPaymentAmount })}
          />
        </Group>
      )}
    </>
  )
}
