/**
 * IdenEx Credentis - Workflow Template Controller
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * Provides API access to pre-built workflow templates that SMEs can
 * pick, configure, and deploy without engineering cycles. Templates
 * cover finance, e-commerce, HR, supply chain, and insurance use cases.
 * 
 * @module controllers/workflow/WorkflowTemplateController
 * @copyright 2024-2026 IdenEx Credentis
 */

import { Controller, Get, Path, Query, Route, Tags, Security, Post, Body } from 'tsoa'
import {
  workflowTemplates,
  getTemplateById,
  getTemplatesByCategory,
  getTemplatesByIndustry,
  instantiateTemplate,
  WorkflowTemplate,
} from '../../services/workflow/templates'
import { workflowRepository } from '../../persistence/WorkflowRepository'

interface TemplateListItem {
  id: string
  name: string
  description: string
  category: string
  industry: string[]
  triggerTypes: string[]
  outputVCs: string[]
}

interface TemplateDetail extends TemplateListItem {
  inputSchema: Record<string, unknown>
  steps: Array<{ action: string; description: string }>
  configurable: Array<{
    field: string
    label: string
    type: string
    options?: string[]
    default?: unknown
  }>
}

interface InstantiateTemplateRequest {
  name?: string
  tenantId: string
  config: Record<string, unknown>
}

interface InstantiateTemplateResponse {
  workflowId: string
  name: string
  tenantId: string
  templateId: string
  actions: Array<{ action: string; config: Record<string, unknown> }>
}

@Route('/workflow-templates')
@Tags('Workflow Templates')
export class WorkflowTemplateController extends Controller {
  /**
   * List all available workflow templates
   */
  @Get('/')
  public async listTemplates(
    @Query() category?: string,
    @Query() industry?: string
  ): Promise<TemplateListItem[]> {
    let templates: WorkflowTemplate[] = workflowTemplates

    if (category) {
      templates = getTemplatesByCategory(category)
    } else if (industry) {
      templates = getTemplatesByIndustry(industry)
    }

    return templates.map((t: WorkflowTemplate) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      industry: t.industry,
      triggerTypes: t.triggerTypes,
      outputVCs: t.outputVCs,
    }))
  }

  /**
   * Get template details by ID
   */
  @Get('/{templateId}')
  public async getTemplate(@Path() templateId: string): Promise<TemplateDetail> {
    const template = getTemplateById(templateId)
    if (!template) {
      this.setStatus(404)
      throw new Error(`Template ${templateId} not found`)
    }

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      industry: template.industry,
      triggerTypes: template.triggerTypes,
      outputVCs: template.outputVCs,
      inputSchema: template.inputSchema as Record<string, unknown>,
      steps: template.steps.map((s: { action: string; description: string }) => ({
        action: s.action,
        description: s.description,
      })),
      configurable: template.configurable,
    }
  }

  /**
   * Get available template categories
   */
  @Get('/meta/categories')
  public async getCategories(): Promise<string[]> {
    const categories = new Set<string>()
    workflowTemplates.forEach((t: WorkflowTemplate) => categories.add(t.category))
    return Array.from(categories)
  }

  /**
   * Get available template industries
   */
  @Get('/meta/industries')
  public async getIndustries(): Promise<string[]> {
    const industries = new Set<string>()
    workflowTemplates.forEach((t: WorkflowTemplate) => t.industry.forEach((i: string) => industries.add(i)))
    return Array.from(industries)
  }

  /**
   * Get available VC types across all templates
   */
  @Get('/meta/vc-types')
  public async getVcTypes(): Promise<string[]> {
    const vcTypes = new Set<string>()
    workflowTemplates.forEach((t: WorkflowTemplate) => t.outputVCs.forEach((v: string) => vcTypes.add(v)))
    return Array.from(vcTypes)
  }

  /**
   * Instantiate a template and create a workflow
   */
  @Post('/{templateId}/instantiate')
  @Security('jwt', ['admin', 'tenant'])
  public async instantiate(
    @Path() templateId: string,
    @Body() request: InstantiateTemplateRequest
  ): Promise<InstantiateTemplateResponse> {
    const template = getTemplateById(templateId)
    if (!template) {
      this.setStatus(404)
      throw new Error(`Template ${templateId} not found`)
    }

    // Validate required config fields
    const missing = this.validateConfig(template, request.config)
    if (missing.length > 0) {
      this.setStatus(400)
      throw new Error(`Missing required config fields: ${missing.join(', ')}`)
    }

    // Instantiate the template with config - now using correct function signature
    const workflow = instantiateTemplate(template, request.tenantId, request.config)

    // Apply custom name if provided
    if (request.name) {
      workflow.name = request.name
    }

    // Save to workflow repository
    workflowRepository.save({
      ...workflow,
      createdAt: new Date(),
    })

    return {
      workflowId: workflow.id,
      name: workflow.name,
      tenantId: workflow.tenantId,
      templateId: template.id,
      actions: workflow.actions.map((a: { action: string; config?: Record<string, unknown> }) => ({
        action: a.action,
        config: a.config || {},
      })),
    }
  }

  /**
   * Preview what a template would produce with given config (without saving)
   */
  @Post('/{templateId}/preview')
  public async preview(
    @Path() templateId: string,
    @Body() body: { tenantId: string; config: Record<string, unknown> }
  ): Promise<{ actions: Array<{ action: string; config: Record<string, unknown> }> }> {
    const template = getTemplateById(templateId)
    if (!template) {
      this.setStatus(404)
      throw new Error(`Template ${templateId} not found`)
    }

    const workflow = instantiateTemplate(template, body.tenantId, body.config)

    return {
      actions: workflow.actions.map((a: { action: string; config?: Record<string, unknown> }) => ({
        action: a.action,
        config: a.config || {},
      })),
    }
  }

  private validateConfig(template: WorkflowTemplate, config: Record<string, unknown>): string[] {
    const missing: string[] = []
    for (const field of template.configurable) {
      // Only check fields that don't have defaults
      if (field.default === undefined && (config[field.field] === undefined || config[field.field] === null)) {
        missing.push(field.field)
      }
    }
    return missing
  }
}
