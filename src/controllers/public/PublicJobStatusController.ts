import { Controller, Get, Path, Route, Tags } from 'tsoa'

import { jobStatusLinkService, type PublicJobView } from '../../services/JobStatusLinkService'

/**
 * The page a client opens from the link the office sent: one job, no sign-in.
 * Called by the phone app's public /job/[code] page.
 */
@Route('api/public/job')
@Tags('Public Job Status')
export class PublicJobStatusController extends Controller {
  @Get('{code}')
  public view(@Path() code: string): { found: true; job: PublicJobView } | { found: false; error: string } {
    const job = jobStatusLinkService.view(code)
    if (!job) {
      this.setStatus(404)
      return { found: false, error: 'This link is not valid any more. Ask the company for a new one.' }
    }
    return { found: true, job }
  }
}
