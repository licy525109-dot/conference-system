import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { ExternalCheckinService } from "./external-checkin.service";
import { AdminExternalCheckinController, PublicExternalCheckinController } from "./external-checkin.controller";

@Module({ imports: [AdminModule], providers: [ExternalCheckinService], controllers: [AdminExternalCheckinController, PublicExternalCheckinController] })
export class ExternalCheckinModule {}
