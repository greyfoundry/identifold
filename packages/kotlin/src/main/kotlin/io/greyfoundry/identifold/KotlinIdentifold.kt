package io.greyfoundry.identifold

data class KotlinPublicId(
    val value: String,
    val namespace: String,
    val machineId: String,
)

object KotlinIdentifold {
    fun parseMachineId(value: String): String = Identifold.parseMachineId(value)

    fun publicIdFromMachineId(machineId: String, namespace: String): String =
        Identifold.publicIdFromMachineId(machineId, namespace)

    fun parsePublicId(value: String): KotlinPublicId =
        Identifold.parsePublicId(value).let {
            KotlinPublicId(it.value(), it.namespace(), it.machineId())
        }

    fun checkSymbol(payload: String, sequential: Boolean): Char =
        Identifold.checkSymbol(payload, sequential)

    fun createReferenceCandidate(
        registry: List<Identifold.NamespaceDefinition>,
        namespace: String,
        randomBytes: List<Int>,
    ): String = Identifold.createReferenceCandidate(registry, namespace, randomBytes)

    fun formatSequentialReference(
        registry: List<Identifold.NamespaceDefinition>,
        namespace: String,
        sequence: String,
        scope: String = "",
    ): String = Identifold.formatSequentialReference(registry, namespace, sequence, scope)

    fun normalize(value: String, registry: List<Identifold.NamespaceDefinition>): String =
        Identifold.normalize(value, registry)
}
