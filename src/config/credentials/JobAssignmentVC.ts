export const JOB_ASSIGNMENT_VC_TYPE = 'JobAssignmentVC'

/** Proof of one worker's assignment to one job, not a requisition or a staff role. */
export const JOB_ASSIGNMENT_JSON_SCHEMA = {
  $id: 'JobAssignmentVC-1.0.0',
  type: 'object',
  required: ['credentialSubject'],
  properties: {
    credentialSubject: {
      type: 'object',
      required: ['jobId', 'workflowRunId', 'assignment'],
      properties: {
        jobId: { type: 'string', minLength: 1 },
        workflowRunId: { type: 'string', minLength: 1 },
        reference: { type: 'string' },
        poNumber: { type: 'string' },
        problemType: { type: 'string' },
        vehicleReference: { type: 'string' },
        orgName: { type: 'string' },
        assignment: {
          type: 'object',
          required: ['assigneeId', 'assignedAt'],
          properties: {
            assigneeId: { type: 'string', minLength: 1 },
            assignedAt: { type: 'string', format: 'date-time' },
          },
          additionalProperties: true,
        },
        description: { type: 'string' },
        location: { type: 'string' },
        scheduledDate: { type: 'string' },
        approvedAmount: { type: 'number' },
        currency: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
}
