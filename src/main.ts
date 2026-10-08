import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { initLocale } from './i18n';

initLocale();

createApp(App).use(createPinia()).mount('#app');
