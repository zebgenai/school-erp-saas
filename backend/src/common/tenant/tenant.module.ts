import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantIsolationInterceptor } from './tenant.interceptor';
import { TenantMiddleware } from './tenant.middleware';
import { TenantResolverService } from './tenant.service';

@Module({
  providers: [
    TenantResolverService,
    TenantMiddleware,
    { provide: APP_INTERCEPTOR, useClass: TenantIsolationInterceptor },
  ],
  exports: [TenantResolverService],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
