import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Oegd } from '../../oegd/entities/oegd.entity';

@Entity('acciones_estrategicas', { schema: 'planning' })
export class AccionEstrategica {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'oegd_id' })
  oegdId: number;

  @Index()
  @Column({ length: 20, unique: true })
  codigo: string;

  @Column({ length: 300 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column({ length: 500, nullable: true })
  indicador: string;

  @Column({ name: 'responsable_area', length: 100, nullable: true })
  responsableArea: string;

  @Column({ name: 'fecha_inicio', type: 'date', nullable: true })
  fechaInicio: Date;

  @Column({ name: 'fecha_fin', type: 'date', nullable: true })
  fechaFin: Date;

  @Index()
  @Column({ default: true })
  activo: boolean;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null | undefined;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null | undefined;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Oegd, (oegd) => oegd.accionesEstrategicas)
  @JoinColumn({ name: 'oegd_id' })
  oegd: Oegd;
}
