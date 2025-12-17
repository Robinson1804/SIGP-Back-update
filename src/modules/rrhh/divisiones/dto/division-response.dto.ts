export class DivisionResponseDto {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  divisionPadreId: number;
  jefeId: number;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class DivisionDetailResponseDto extends DivisionResponseDto {
  divisionPadre?: {
    id: number;
    codigo: string;
    nombre: string;
  };
  jefe?: {
    id: number;
    nombres: string;
    apellidos: string;
    cargo: string;
  };
}

export class DivisionTreeResponseDto extends DivisionResponseDto {
  jefe?: {
    id: number;
    nombres: string;
    apellidos: string;
    cargo: string;
  };
  hijos?: DivisionTreeResponseDto[];
  totalPersonal?: number;
}
