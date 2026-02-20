import { initializeMessagingHub } from './messaging/hub';
import './recording/manager'; // Registers alarm listener for keepalive

initializeMessagingHub();
