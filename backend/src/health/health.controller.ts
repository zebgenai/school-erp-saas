import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Combined health — backward compatible */
  @Get()
  async check() {
    const ready = await this.health.readiness();
    if (ready.status !== 'ok') {
      throw new ServiceUnavailableException(ready);
    }
    return ready;
  }

  /** Kubernetes liveness probe — process alive */
  @Get('live')
  live() {
    return this.health.liveness();
  }

  /** Kubernetes readiness probe — can serve traffic */
  @Get('ready')
  async ready() {
    const result = await this.health.readiness();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
