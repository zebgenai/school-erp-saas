import { Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { SkipForcePassword } from '../common/decorators/skip-force-password.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto-login';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @SkipForcePassword()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @ClientIp() ip: string,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.login(dto, ip, userAgent, req.tenantSchool ?? null);
  }

  @SkipForcePassword()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @Post('verify-otp')
  verifyOtp(
    @Body() dto: VerifyOtpDto,
    @ClientIp() ip: string,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.verifyLoginOtp(
      dto.challengeId,
      dto.code,
      ip,
      userAgent,
      req.tenantSchool ?? null,
    );
  }

  @SkipForcePassword()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @Post('verify-login-otp')
  verifyLoginOtp(
    @Body() dto: VerifyOtpDto,
    @ClientIp() ip: string,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.verifyLoginOtp(
      dto.challengeId,
      dto.code,
      ip,
      userAgent,
      req.tenantSchool ?? null,
    );
  }

  @SkipForcePassword()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('resend-otp')
  resendOtp(
    @Body() dto: ResendOtpDto,
    @ClientIp() ip: string,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.resendLoginOtp(
      dto.challengeId,
      ip,
      userAgent,
      req.tenantSchool ?? null,
    );
  }

  @SkipForcePassword()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('resend-login-otp')
  resendLoginOtp(
    @Body() dto: ResendOtpDto,
    @ClientIp() ip: string,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.resendLoginOtp(
      dto.challengeId,
      ip,
      userAgent,
      req.tenantSchool ?? null,
    );
  }

  @SkipForcePassword()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto, @ClientIp() ip: string, @Req() req: Request) {
    return this.authService.refresh(dto.refreshToken, ip, req.tenantSchool ?? null);
  }

  @SkipForcePassword()
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @SkipForcePassword()
  @Post('logout-all')
  logoutAll(@CurrentUserDecorator() user: any) {
    return this.authService.logoutAll(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @SkipForcePassword()
  @Get('me')
  me(@CurrentUserDecorator() user: any) {
    return this.authService.me(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @SkipForcePassword()
  @Post('change-password')
  changePassword(
    @CurrentUserDecorator() user: any,
    @Body() dto: ChangePasswordDto,
    @ClientIp() ip: string,
  ) {
    return this.authService.changePassword(user.id, dto, ip);
  }

  @SkipForcePassword()
  @Throttle({ short: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @ClientIp() ip: string) {
    return this.authService.requestPasswordReset(dto.email, ip);
  }

  @SkipForcePassword()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto, @ClientIp() ip: string) {
    return this.authService.resetPassword(dto.token, dto.password, ip);
  }
}
