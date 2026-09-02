import { IsIn } from 'class-validator';

export class UpdateUserStatusDto {
  @IsIn(['ACTIVATE', 'DEACTIVATE', 'UNLOCK', 'LOCK'])
  action: 'ACTIVATE' | 'DEACTIVATE' | 'UNLOCK' | 'LOCK';
}
