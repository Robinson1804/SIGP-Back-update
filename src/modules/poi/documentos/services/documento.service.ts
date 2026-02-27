import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Documento } from '../entities/documento.entity';
import { CreateDocumentoDto } from '../dto/create-documento.dto';
import { UpdateDocumentoDto } from '../dto/update-documento.dto';
import { AprobarDocumentoDto } from '../dto/aprobar-documento.dto';
import { DocumentoFase, DocumentoEstado, TipoContenedor } from '../enums/documento.enum';
import { ArchivoService } from '../../../storage/services/archivo.service';
import { NotificacionService } from '../../../notificaciones/services/notificacion.service';
import { TipoNotificacion } from '../../../notificaciones/enums/tipo-notificacion.enum';
import { Usuario } from '../../../auth/entities/usuario.entity';
import { Role } from '../../../../common/constants/roles.constant';
import { Proyecto } from '../../proyectos/entities/proyecto.entity';

@Injectable()
export class DocumentoService {
  private readonly logger = new Logger(DocumentoService.name);

  constructor(
    @InjectRepository(Documento)
    private readonly documentoRepository: Repository<Documento>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(Proyecto)
    private readonly proyectoRepository: Repository<Proyecto>,
    private readonly archivoService: ArchivoService,
    @Inject(forwardRef(() => NotificacionService))
    private readonly notificacionService: NotificacionService,
  ) {}

  async create(createDto: CreateDocumentoDto, userId?: number): Promise<Documento> {
    // Validar relación polimórfica
    if (createDto.tipoContenedor === TipoContenedor.PROYECTO && !createDto.proyectoId) {
      throw new BadRequestException('proyectoId es requerido para tipo PROYECTO');
    }
    if (createDto.tipoContenedor === TipoContenedor.SUBPROYECTO && !createDto.subproyectoId) {
      throw new BadRequestException('subproyectoId es requerido para tipo SUBPROYECTO');
    }

    // Si se proporciona archivoId, obtener información del archivo
    let archivoData: { archivoNombre?: string; archivoTamano?: number; tipoArchivo?: string } = {};
    if (createDto.archivoId) {
      try {
        const archivo = await this.archivoService.findById(createDto.archivoId);
        archivoData = {
          archivoNombre: archivo.nombreOriginal,
          archivoTamano: archivo.tamanoBytes,
          tipoArchivo: archivo.mimeType,
        };
      } catch (error) {
        this.logger.warn(`No se pudo obtener información del archivo ${createDto.archivoId}: ${error.message}`);
      }
    }

    const documento = this.documentoRepository.create({
      ...createDto,
      ...archivoData,
      createdBy: userId,
      updatedBy: userId,
    });

    const saved = await this.documentoRepository.save(documento);

    // Notificar a PMO y ADMIN que hay un documento pendiente de aprobación
    if (createDto.tipoContenedor === TipoContenedor.PROYECTO && createDto.proyectoId) {
      try {
        await this.notificarDocumentoPendienteAprobacion(
          saved,
          createDto.proyectoId,
          userId,
        );
      } catch (error) {
        this.logger.warn(`Error enviando notificación de documento pendiente: ${error.message}`);
      }
    }

    return saved;
  }

  async findAll(filters?: {
    proyectoId?: number;
    subproyectoId?: number;
    fase?: DocumentoFase;
    estado?: DocumentoEstado;
    activo?: boolean;
  }): Promise<Documento[]> {
    const queryBuilder = this.documentoRepository
      .createQueryBuilder('documento')
      .orderBy('documento.fase', 'ASC')
      .addOrderBy('documento.nombre', 'ASC');

    if (filters?.proyectoId) {
      queryBuilder.andWhere('documento.proyectoId = :proyectoId', { proyectoId: filters.proyectoId });
    }

    if (filters?.subproyectoId) {
      queryBuilder.andWhere('documento.subproyectoId = :subproyectoId', { subproyectoId: filters.subproyectoId });
    }

    if (filters?.fase) {
      queryBuilder.andWhere('documento.fase = :fase', { fase: filters.fase });
    }

    if (filters?.estado) {
      queryBuilder.andWhere('documento.estado = :estado', { estado: filters.estado });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('documento.activo = :activo', { activo: filters.activo });
    }

    return queryBuilder.getMany();
  }

  async findByProyecto(proyectoId: number): Promise<any[]> {
    const documentos = await this.documentoRepository.find({
      where: { proyectoId, activo: true },
      relations: ['creador', 'aprobador'],
      order: { fase: 'ASC', nombre: 'ASC' },
    });

    // Generar URLs presignadas para documentos con archivos
    const transformedDocs = await Promise.all(
      documentos.map((doc) => this.transformDocumentoWithUrl(doc)),
    );

    return transformedDocs;
  }

  async findBySubproyecto(subproyectoId: number): Promise<any[]> {
    const documentos = await this.documentoRepository.find({
      where: { subproyectoId, activo: true },
      relations: ['creador', 'aprobador'],
      order: { fase: 'ASC', nombre: 'ASC' },
    });

    // Generar URLs presignadas para documentos con archivos
    const transformedDocs = await Promise.all(
      documentos.map((doc) => this.transformDocumentoWithUrl(doc)),
    );

    return transformedDocs;
  }

  async findOne(id: number): Promise<Documento> {
    const documento = await this.documentoRepository.findOne({
      where: { id },
      relations: ['proyecto', 'subproyecto', 'aprobador'],
    });

    if (!documento) {
      throw new NotFoundException(`Documento con ID ${id} no encontrado`);
    }

    return documento;
  }

  async update(id: number, updateDto: UpdateDocumentoDto, userId?: number): Promise<Documento> {
    const documento = await this.findOne(id);
    Object.assign(documento, updateDto, { updatedBy: userId });
    return this.documentoRepository.save(documento);
  }

  async aprobar(id: number, aprobarDto: AprobarDocumentoDto, userId: number): Promise<Documento> {
    const documento = await this.findOne(id);

    documento.estado = aprobarDto.estado;
    documento.observacionAprobacion = aprobarDto.observacion ?? null;
    documento.aprobadoPor = userId;
    documento.fechaAprobacion = new Date();
    documento.updatedBy = userId;

    const saved = await this.documentoRepository.save(documento);

    // Notificar al creador y roles clave sobre el resultado de la aprobación
    if (documento.tipoContenedor === TipoContenedor.PROYECTO && documento.proyectoId) {
      try {
        await this.notificarResultadoDocumento(saved, documento, aprobarDto.estado, aprobarDto.observacion, userId);
      } catch (error) {
        this.logger.warn(`Error enviando notificación de resultado de aprobación: ${error.message}`);
      }
    }

    return saved;
  }

  async remove(id: number, userId?: number): Promise<Documento> {
    const documento = await this.findOne(id);
    documento.activo = false;
    documento.updatedBy = userId;
    return this.documentoRepository.save(documento);
  }

  // ─── Helpers privados ────────────────────────────────────────────────────────

  private async getAdminUserId(): Promise<number | null> {
    const admin = await this.usuarioRepository.findOne({
      where: { rol: Role.ADMIN, activo: true },
      select: ['id'],
    });
    return admin?.id ?? null;
  }

  private async getPmoUserIds(): Promise<number[]> {
    const pmos = await this.usuarioRepository.find({
      where: { rol: Role.PMO, activo: true },
      select: ['id'],
    });
    return pmos.map(u => u.id);
  }

  /**
   * Notifica a PMO y ADMIN que un nuevo documento está pendiente de aprobación
   */
  private async notificarDocumentoPendienteAprobacion(
    documento: Documento,
    proyectoId: number,
    creadorId?: number,
  ): Promise<void> {
    // Obtener nombre del proyecto
    const proyecto = await this.proyectoRepository.findOne({
      where: { id: proyectoId },
      select: ['id', 'nombre'],
    });
    const proyectoNombre = proyecto?.nombre ?? `Proyecto ID ${proyectoId}`;

    const notificationData = {
      titulo: 'Documento pendiente de aprobación',
      descripcion: `Se ha agregado el documento "${documento.nombre}" (${documento.fase}) al proyecto "${proyectoNombre}" y requiere su aprobación.`,
      entidadTipo: 'Documento',
      entidadId: documento.id,
      proyectoId,
      urlAccion: `/poi/proyecto/detalles?id=${proyectoId}&tab=Documentos`,
    };

    // Notificar a todos los PMO (excepto el creador)
    const pmoIds = await this.getPmoUserIds();
    for (const pmoId of pmoIds) {
      if (pmoId !== creadorId) {
        await this.notificacionService.notificar(
          TipoNotificacion.APROBACIONES,
          pmoId,
          notificationData,
        );
      }
    }

    // Notificar al ADMIN (excepto si es el creador)
    const adminId = await this.getAdminUserId();
    if (adminId && adminId !== creadorId) {
      await this.notificacionService.notificar(
        TipoNotificacion.APROBACIONES,
        adminId,
        notificationData,
      );
    }
  }

  /**
   * Notifica al creador del documento y a SM/Coordinador sobre el resultado de la aprobación
   */
  private async notificarResultadoDocumento(
    saved: Documento,
    documentoOriginal: Documento,
    nuevoEstado: DocumentoEstado,
    observacion?: string,
    aprobadorId?: number,
  ): Promise<void> {
    const proyectoId = documentoOriginal.proyectoId;
    const proyectoNombre = documentoOriginal.proyecto?.nombre ?? `Proyecto ID ${proyectoId}`;
    const aprobado = nuevoEstado === DocumentoEstado.APROBADO;

    const notificationData = {
      titulo: aprobado ? 'Documento aprobado' : 'Documento no aprobado',
      descripcion: aprobado
        ? `El documento "${documentoOriginal.nombre}" del proyecto "${proyectoNombre}" ha sido aprobado.`
        : `El documento "${documentoOriginal.nombre}" del proyecto "${proyectoNombre}" no fue aprobado.${observacion ? ` Observación: ${observacion}` : ''}`,
      entidadTipo: 'Documento',
      entidadId: documentoOriginal.id,
      proyectoId,
      urlAccion: `/poi/proyecto/detalles?id=${proyectoId}&tab=Documentos`,
      observacion: observacion,
    };

    // Recopilar destinatarios únicos (creador, SM, Coordinador) excluyendo al aprobador
    const destinatarios = new Set<number>();
    if (documentoOriginal.createdBy && documentoOriginal.createdBy !== aprobadorId) {
      destinatarios.add(documentoOriginal.createdBy);
    }
    if (documentoOriginal.proyecto?.scrumMasterId && documentoOriginal.proyecto.scrumMasterId !== aprobadorId) {
      destinatarios.add(documentoOriginal.proyecto.scrumMasterId);
    }
    if (documentoOriginal.proyecto?.coordinadorId && documentoOriginal.proyecto.coordinadorId !== aprobadorId) {
      destinatarios.add(documentoOriginal.proyecto.coordinadorId);
    }

    for (const destinatarioId of destinatarios) {
      await this.notificacionService.notificar(
        TipoNotificacion.APROBACIONES,
        destinatarioId,
        notificationData,
      );
    }
  }

  /**
   * Transforma un documento para incluir nombreCompleto en creador y aprobador
   */
  private transformDocumento(doc: Documento): any {
    return {
      ...doc,
      creador: doc.creador
        ? {
            id: doc.creador.id,
            nombreCompleto: `${doc.creador.nombre} ${doc.creador.apellido}`.trim(),
            nombres: doc.creador.nombre,
            apellidoPaterno: doc.creador.apellido,
          }
        : undefined,
      aprobador: doc.aprobador
        ? {
            id: doc.aprobador.id,
            nombreCompleto: `${doc.aprobador.nombre} ${doc.aprobador.apellido}`.trim(),
            nombres: doc.aprobador.nombre,
            apellidoPaterno: doc.aprobador.apellido,
          }
        : undefined,
    };
  }

  /**
   * Transforma un documento incluyendo URL presignada para archivos
   */
  private async transformDocumentoWithUrl(doc: Documento): Promise<any> {
    const transformed = this.transformDocumento(doc);

    // Si tiene archivoId, generar URL presignada
    if (doc.archivoId) {
      try {
        const archivoUrl = await this.archivoService.getDownloadUrl(doc.archivoId);
        transformed.archivoUrl = archivoUrl;
      } catch (error) {
        this.logger.warn(`No se pudo obtener URL para archivo ${doc.archivoId}: ${error.message}`);
        // Mantener archivoUrl como null si no se puede generar
        transformed.archivoUrl = null;
      }
    }

    return transformed;
  }

  /**
   * Obtener URL de descarga para un documento específico
   */
  async getDownloadUrl(id: number): Promise<{ downloadUrl: string }> {
    const documento = await this.findOne(id);

    if (!documento.archivoId) {
      throw new BadRequestException('Este documento no tiene un archivo adjunto');
    }

    const downloadUrl = await this.archivoService.getDownloadUrl(documento.archivoId);
    return { downloadUrl };
  }
}
