<template>
    <Teleport to="body">
        <Transition name="modal-fade">
            <div v-if="store.modalState?.component" aria-modal="true" class="modal-wrapper" role="dialog" tabindex="-1">
                <component :is="store.modalState?.component"
                    class="relative p-6 rounded-2xl border border-white/30 shadow-2xl"
                    style="background: linear-gradient(145deg, rgba(255,255,255,0.95), rgba(208,230,243,0.90)); backdrop-filter: blur(20px) saturate(180%);"
                    v-bind="store.modalState?.props" />
            </div>
        </Transition>
    </Teleport>
</template>

<script lang="ts" setup>
import useModalStore from "../../stores/useModalStore.ts";
import {onMounted, onUnmounted} from "vue";

const store = useModalStore();

// Make a function that will trigger on keydown
function keydownListener(event: KeyboardEvent) {
    // Assert the key is escape
    if (event.key === "Escape") store.closeModal();
}

// Attach event listener on mount
onMounted(() => {
    document.addEventListener("keydown", keydownListener);
});

// Clean up on unmount
onUnmounted(() => {
    document.removeEventListener("keydown", keydownListener);
});
</script>

<style scoped>
.modal-wrapper {
    position: fixed;
    left: 0;
    top: 0;

    z-index: 1000;

    width: 100vw;
    height: 100vh;
    background: rgba(15, 63, 94, 0.4);
    backdrop-filter: blur(8px);

    display: grid;
    place-items: center;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
    opacity: 0;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
    transition: 0.25s ease all;
}
</style>
