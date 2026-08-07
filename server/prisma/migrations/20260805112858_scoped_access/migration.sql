-- AlterTable
ALTER TABLE "maps" ADD COLUMN     "restricted_access_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "nodes" ADD COLUMN     "restrict_to_grants_only" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "collaborator_tag_scopes" (
    "id" TEXT NOT NULL,
    "collaborator_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaborator_tag_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_access_grants" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collaborator_tag_scopes_collaborator_id_tag_id_key" ON "collaborator_tag_scopes"("collaborator_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "node_access_grants_node_id_user_id_key" ON "node_access_grants"("node_id", "user_id");

-- AddForeignKey
ALTER TABLE "collaborator_tag_scopes" ADD CONSTRAINT "collaborator_tag_scopes_collaborator_id_fkey" FOREIGN KEY ("collaborator_id") REFERENCES "map_collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborator_tag_scopes" ADD CONSTRAINT "collaborator_tag_scopes_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_access_grants" ADD CONSTRAINT "node_access_grants_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_access_grants" ADD CONSTRAINT "node_access_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
