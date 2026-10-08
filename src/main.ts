import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useEditor } from './editor/store';
import { initLocale } from './i18n';

initLocale();

const app = createApp(App).use(createPinia());

// Поднимаем граф из автосохранения и включаем запись дальнейших правок.
const editor = useEditor();
editor.restoreSaved();
editor.startAutosave();

app.mount('#app');
