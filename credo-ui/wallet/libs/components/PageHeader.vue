<template>
    <div class="shadow-lg" style="background: linear-gradient(145deg, rgba(255,255,255,0.95), rgba(208,230,243,0.9)); backdrop-filter: blur(12px) saturate(180%);">
        <div class="px-4 sm:px-6 lg:mx-auto lg:max-w-6xl lg:px-8">
            <div class="py-6 lg:py-3 md:flex md:items-center md:justify-between lg:border-[#D0E6F3]">
                <div class="min-w-0 flex-1">
                    <!-- --- -->

                    <div class="flex items-center">
                        <slot name="icon"></slot>
                        <div>
                            <div class="flex items-center">
                                <!-- Title -->
                                <slot name="title"></slot>
                            </div>

                            <!-- --- -->
                        </div>
                    </div>
                </div>
                <div class="mt-6 flex space-x-3 md:ml-4 md:mt-0">
                    <!-- Menu -->
                    <slot name="menu"></slot>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    name: "PageHeader",
};
</script>

<style scoped></style>
