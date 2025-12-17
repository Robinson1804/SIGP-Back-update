import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  MaxLength,
} from 'class-validator';

export class UpdateDivisionDto {
  @IsString()
  @IsOptional()
  @MaxLength(150)
  nombre?: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsInt()
  @IsOptional()
  divisionPadreId?: number;

  @IsInt()
  @IsOptional()
  jefeId?: number;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
