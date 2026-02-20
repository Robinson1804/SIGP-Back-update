import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProyectoEstado, Clasificacion } from '../../proyectos/enums/proyecto-estado.enum';

@Entity('subproyectos', { schema: 'poi' })
export class Subproyecto {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'proyecto_padre_id' })
  proyectoPadreId: number;

  @ManyToOne('Proyecto', 'subproyectos')
  @JoinColumn({ name: 'proyecto_padre_id' })
  proyectoPadre: any;

  @Column({ length: 20 })
  codigo: string;

  @Column({ length: 200 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  // ==========================================
  // CLASIFICACIÓN
  // ==========================================

  @Column({ type: 'varchar', length: 50, nullable: true, enum: Clasificacion })
  clasificacion?: Clasificacion;

  // ==========================================
  // STAKEHOLDERS
  // ==========================================

  @Index()
  @Column({ name: 'coordinador_id', nullable: true })
  coordinadorId?: number;

  @ManyToOne('Usuario', { nullable: true })
  @JoinColumn({ name: 'coordinador_id' })
  coordinador?: any;

  // Área Usuaria (Patrocinador) - Un solo usuario para subproyectos
  @Column({ name: 'area_usuaria', type: 'int', nullable: true })
  areaUsuariaId?: number;

  @ManyToOne('Usuario', { nullable: true })
  @JoinColumn({ name: 'area_usuaria' })
  areaUsuaria?: any;

  // ==========================================
  // ADMINISTRATIVO
  // ==========================================

  @Column({ length: 100, nullable: true })
  coordinacion?: string;

  @Column({ name: 'area_responsable', length: 100, nullable: true })
  areaResponsable?: string;

  // ==========================================
  // FINANCIERO
  // ==========================================

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  monto: number;

  @Column({ name: 'costos_anuales', type: 'jsonb', nullable: true })
  costosAnuales?: { anio: number; monto: number }[];

  // Años del subproyecto (actualizado de simple-array a array)
  @Column({ type: 'int', array: true, nullable: true })
  anios?: number[];

  // Áreas financieras (actualizado de simple-array a array)
  @Column({ name: 'areas_financieras', type: 'text', array: true, nullable: true })
  areasFinancieras?: string[];

  /**
   * @deprecated Los responsables ahora se manejan via tabla rrhh.asignaciones
   * con tipoAsignacion='Subproyecto'. Este campo se mantiene por compatibilidad
   * pero no se usa activamente.
   */
  @Column({ type: 'simple-array', nullable: true })
  responsables: number[];

  // ==========================================
  // ALCANCE Y VALOR DE NEGOCIO
  // ==========================================

  @Column({ type: 'text', array: true, nullable: true })
  alcances?: string[];

  @Column({ type: 'text', nullable: true })
  problematica?: string;

  @Column({ type: 'text', nullable: true })
  beneficiarios?: string;

  @Column({ type: 'text', array: true, nullable: true })
  beneficios?: string[];

  // ==========================================
  // ESTADO
  // ==========================================

  @Index()
  @Column({
    type: 'varchar',
    length: 50,
    default: ProyectoEstado.PENDIENTE,
    enum: ProyectoEstado,
  })
  estado: ProyectoEstado;

  // Equipo propio
  @Column({ name: 'scrum_master_id', nullable: true })
  scrumMasterId: number;

  @ManyToOne('Usuario', { nullable: true })
  @JoinColumn({ name: 'scrum_master_id' })
  scrumMaster: any;

  // Fechas
  @Column({ name: 'fecha_inicio', type: 'date', nullable: true })
  fechaInicio: Date;

  @Column({ name: 'fecha_fin', type: 'date', nullable: true })
  fechaFin: Date;

  // Auditoría
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

  // ==========================================
  // RELACIONES INVERSAS
  // ==========================================

  @OneToMany('Documento', 'subproyecto')
  documentos?: any[];

  @OneToMany('Acta', 'subproyecto')
  actas?: any[];

  @OneToMany('Requerimiento', 'subproyecto')
  requerimientos?: any[];

  @OneToMany('Cronograma', 'subproyecto')
  cronogramas?: any[];
}
