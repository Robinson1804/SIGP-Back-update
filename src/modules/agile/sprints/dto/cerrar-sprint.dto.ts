import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CerrarSprintDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkEvidencia?: string;
}
