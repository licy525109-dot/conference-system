import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { CertificatesService } from "./certificates.service";
import { CertificateRenderer } from "./certificate-renderer";
import { AdminCertificatesController, PublicCertificatesController, CertificatePageController } from "./certificates.controller";

@Module({ imports: [AdminModule], providers: [CertificatesService, CertificateRenderer], controllers: [AdminCertificatesController, PublicCertificatesController, CertificatePageController], exports: [CertificatesService] })
export class CertificatesModule {}
