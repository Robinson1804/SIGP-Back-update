import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TareaEstado, TareaPrioridad } from '../enums/cronograma.enum';
import { Cronograma } from './cronograma.entity';
import { Usuario } from '../../../auth/entities/usuario.entity';

@Entity({ schema: 'poi', name: 'tareas_cronograma' })
export class TareaCronograma {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'cronograma_id' })
  cronogramaId: number;

  @Column({ length: 20 })
  codigo: string;

  @Column({ length: 200 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column({ name: 'fecha_inicio', type: 'date' })
  fechaInicio: Date;

  @Column({ name: 'fecha_fin', type: 'date' })
  fechaFin: Date;

  @Column({ name: 'fecha_inicio_real', type: 'date', nullable: true })
  fechaInicioReal: Date;

  @Column({ name: 'fecha_fin_real', type: 'date', nullable: true })
  fechaFinReal: Date;

  @Column({
    type: 'enum',
    enum: TareaEstado,
    default: TareaEstado.PENDIENTE,
  })
  estado: TareaEstado;

  @Column({
    type: 'enum',
    enum: TareaPrioridad,
    default: TareaPrioridad.MEDIA,
  })
  prioridad: TareaPrioridad;

  @Column({ name: 'porcentaje_avance', type: 'decimal', precision: 5, scale: 2, default: 0 })
  porcentajeAvance: number;

  @Column({ name: 'responsable_id', nullable: true })
  responsableId: number;

  @Column({ name: 'tarea_padre_id', nullable: true })
  tareaPadreId: number;

  @Column({ type: 'int', nullable: true })
  orden: number;

  @Column({ name: 'dependencias', type: 'jsonb', nullable: true })
  dependencias: number[];

  @Column({ type: 'text', nullable: true })
  notas: string;

  @Column({ length: 50, nullable: true })
  fase: string;

  @Column({ name: 'es_hito', default: false })
  esHito: boolean;

  @Column({ length: 20, nullable: true })
  color: string;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null | undefined;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null | undefined;

  // Relations
  @ManyToOne(() => Cronograma, (cronograma) => cronograma.tareas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cronograma_id' })
  cronograma: Cronograma;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'responsable_id' })
  responsable: Usuario;

  @ManyToOne(() => TareaCronograma)
  @JoinColumn({ name: 'tarea_padre_id' })
  tareaPadre: TareaCronograma;
}
