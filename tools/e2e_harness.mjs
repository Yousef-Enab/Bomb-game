// خادم اختبار المتصفح: يستخدم أسئلة اختبار متعددة الإجابات (لا تدخل في بنك اللعبة) وتوقيت الهجوم الحقيقي.
import { createApp } from '../server.js';
const Q = [{ id: 'm1', text: 'اذكر ثلاثة أشياء', cat: 'عام', d: 1, answers: ['أ', ['ب', 'bee'], 'ج'] }];
createApp({ minSec: 1, questions: Q }).server.listen(3077, '127.0.0.1', () => console.log('ready'));
