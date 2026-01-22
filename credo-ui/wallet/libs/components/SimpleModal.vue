<template>
    <TransitionRoot :show="open" as="template">
        <Dialog as="div" class="relative z-[1000]" @close="close">
            <TransitionChild as="template" enter="ease-out duration-300" enter-from="opacity-0" enter-to="opacity-100" leave="ease-in duration-200" leave-from="opacity-100" leave-to="opacity-0">
                <div class="fixed inset-0 transition-opacity" style="background: rgba(15, 63, 94, 0.4); backdrop-filter: blur(8px);" />
            </TransitionChild>

            <div class="fixed inset-0 z-[1001] w-screen overflow-y-auto">
                <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                    <TransitionChild
                        as="template"
                        enter="ease-out duration-300"
                        enter-from="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        enter-to="opacity-100 translate-y-0 sm:scale-100"
                        leave="ease-in duration-200"
                        leave-from="opacity-100 translate-y-0 sm:scale-100"
                        leave-to="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                    >
                        <DialogPanel 
                            class="relative transform overflow-hidden rounded-2xl border border-white/30 px-4 pb-4 pt-5 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6"
                            style="background: linear-gradient(145deg, rgba(255,255,255,0.95), rgba(208,230,243,0.90)); backdrop-filter: blur(20px) saturate(180%);"
                        >
                            <div class="sm:flex sm:items-start">
                                <div class="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                                    <DialogTitle as="h3" class="text-lg font-semibold leading-6 text-[#0F3F5E]">{{ title }}</DialogTitle>
                                    <div class="mt-3">
                                        <slot/>
                                    </div>
                                </div>
                            </div>

                        </DialogPanel>
                    </TransitionChild>
                </div>
            </div>
        </Dialog>
    </TransitionRoot>
</template>

<script lang="ts" setup>
import {Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot} from "@headlessui/vue";

const props = defineProps({
    open: {
        type: Boolean,
        required: true
    },
    title: {
        type: String,
        required: true
    }
})

const emit = defineEmits(["close"])

function close() {
    emit("close")
}
</script>
