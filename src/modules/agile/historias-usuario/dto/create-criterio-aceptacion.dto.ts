import { IsString, IsInt, IsOptional, IsNotEmpty, IsEnum } from 'class-validator';
import { CriterioEstado } from '../enums/historia-usuario.enum';

export class CreateCriterioAceptacionDto {
  @IsInt()
  @IsNotEmpty()
  historiaUsuarioId: number;

  @IsString()
  @IsNotEmpty()
  given: string;

  @IsString()
  @IsNotEmpty()
  when: string;

  @IsString()
  @IsNotEmpty()
  then: string;

  @IsOptional()
  @IsEnum(CriterioEstado)
  estado?: CriterioEstado;

  @IsOptional()
  @IsInt()
  orden?: number;
}
