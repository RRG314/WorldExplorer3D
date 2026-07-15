import { CHAT_MAX_LENGTH, reportMessage } from './chat.js?v=55';
import {
  dismissInvite,
  markInviteSeen,
  removeFriend
} from './social.js?v=55';

function createUiRoomEventsApi(context) {
  const {
    appCtx,
    refs,
    state,
    callbacks,
    handlers,
    helpers
  } = context;

  const {
    applyEntitlementCopy,
    attemptPendingRoomJoin,
    closeRoomPanel,
    deactivateRoom,
    ensureInviteJoinAccess,
    handleAddFriend,
    handleBrowseRooms,
    handleCopyInvite,
    handleCreateArtifact,
    handleCreateRoom,
    handleDeleteOwnedRoom,
    handleDeleteRoomActivity,
    handleInviteFriend,
    handleJoinRoom,
    handleJoinWeeklyFeaturedRoom,
    handleLeaveRoom,
    handleManualAddFriend,
    handleOpenOwnedRoom,
    handleOpenRoomActivity,
    handleRemoveArtifact,
    handleSaveHomeBase,
    handleSaveRoomSettings,
    handleSendChat,
    handleStopRoomActivity,
    openRoomPanel,
    refreshFeaturedRooms,
    setChatOpen,
    setChatStatus,
    setStatus,
    updateToggleStates
  } = handlers;

  const {
    eventElementTarget,
    normalizeCode,
    sanitizeText,
    setInputCode
  } = helpers;

  function closeFloatMenus() {
    document.querySelectorAll('.floatMenu').forEach((menu) => menu.classList.remove('open'));
  }

  function activateMultiplayerTabFromQuery() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') !== 'multiplayer') return;

    const targetBtn = document.querySelector('.tab-btn[data-tab="multiplayer"]');
    if (targetBtn instanceof HTMLElement) targetBtn.click();
  }

  function wireEvents() {
    refs.titleCreateBtn?.addEventListener('click', handleCreateRoom);
    refs.roomPanelCreateBtn?.addEventListener('click', handleCreateRoom);

    refs.titleVisibilitySelect?.addEventListener('change', () => callbacks.syncCreateOptionFields('title'));
    refs.roomPanelVisibilitySelect?.addEventListener('change', () => callbacks.syncCreateOptionFields('panel'));
    refs.titleRoomNameInput?.addEventListener('input', () => callbacks.syncCreateOptionFields('title'));
    refs.roomPanelCreateNameInput?.addEventListener('input', () => callbacks.syncCreateOptionFields('panel'));
    refs.titleLocationTagInput?.addEventListener('input', () => callbacks.syncCreateOptionFields('title'));
    refs.roomPanelLocationTagInput?.addEventListener('input', () => callbacks.syncCreateOptionFields('panel'));

    refs.titleJoinBtn?.addEventListener('click', () => handleJoinRoom());
    refs.roomPanelJoinBtn?.addEventListener('click', () => handleJoinRoom());

    refs.titleInviteBtn?.addEventListener('click', handleCopyInvite);
    refs.roomPanelInviteBtn?.addEventListener('click', handleCopyInvite);

    refs.titleLeaveBtn?.addEventListener('click', handleLeaveRoom);
    refs.roomPanelLeaveBtn?.addEventListener('click', handleLeaveRoom);

    refs.titlePanelBtn?.addEventListener('click', openRoomPanel);
    refs.roomPanelCloseBtn?.addEventListener('click', closeRoomPanel);

    refs.roomPanelModal?.addEventListener('click', (event) => {
      if (event.target === refs.roomPanelModal) closeRoomPanel();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeRoomPanel();
    });

    refs.floatCreate?.addEventListener('click', () => {
      handleCreateRoom();
      closeFloatMenus();
    });

    refs.floatJoin?.addEventListener('click', () => {
      openRoomPanel();
      refs.roomPanelCodeInput?.focus();
      closeFloatMenus();
    });

    refs.floatInvite?.addEventListener('click', () => {
      handleCopyInvite();
      closeFloatMenus();
    });

    refs.floatLeave?.addEventListener('click', () => {
      handleLeaveRoom();
      closeFloatMenus();
    });

    refs.floatGhosts?.addEventListener('click', () => {
      if (!state.currentRoom) {
        setStatus('Join a room before toggling ghosts.', true);
        return;
      }
      state.ghostsEnabled = !state.ghostsEnabled;
      if (state.ghostManager) state.ghostManager.setVisible(state.ghostsEnabled);
      updateToggleStates();
      closeFloatMenus();
    });

    refs.floatChat?.addEventListener('click', () => {
      if (!state.currentRoom) {
        setStatus('Join a room before opening chat.', true);
        return;
      }
      setChatOpen(!state.chatOpen);
      closeFloatMenus();
    });

    refs.chatToggleBtn?.addEventListener('click', () => {
      if (!state.currentRoom) {
        setStatus('Join a room before opening chat.', true);
        return;
      }
      setChatOpen(!state.chatOpen);
    });

    refs.chatCloseBtn?.addEventListener('click', () => setChatOpen(false));
    refs.chatSendBtn?.addEventListener('click', handleSendChat);
    refs.chatInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendChat();
      }
    });

    refs.chatMessages?.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest('button[data-msgid]');
      if (!button || !state.currentRoom) return;

      const msgId = sanitizeText(button.dataset.msgid || '', 128);
      if (!msgId) return;

      try {
        await reportMessage(state.currentRoom.code, msgId, 'User report');
        setChatStatus('Message reported.');
      } catch (err) {
        setChatStatus(err?.message || 'Could not report this message.', true);
      }
    });

    refs.titleCodeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleJoinRoom();
      }
    });

    refs.roomPanelCodeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleJoinRoom();
      }
    });

    const openAccountCenter = async () => {
      if (!state.authUser) {
        const signInBtn = document.getElementById('appSignInBtn');
        if (signInBtn) signInBtn.click();
        setStatus('Sign in first to use multiplayer rooms.');
        return;
      }
      window.location.assign('../account/');
    };

    refs.titleTrialBtn?.addEventListener('click', openAccountCenter);
    refs.roomPanelTrialBtn?.addEventListener('click', openAccountCenter);

    refs.titleBrowseBtn?.addEventListener('click', handleBrowseRooms);
    refs.titleFeaturedRefreshBtn?.addEventListener('click', () => refreshFeaturedRooms(false));
    refs.titleFeaturedWeeklyBtn?.addEventListener('click', handleJoinWeeklyFeaturedRoom);
    refs.titleAddFriendBtn?.addEventListener('click', () => {
      handleManualAddFriend();
    });
    refs.roomPanelSaveSettingsBtn?.addEventListener('click', handleSaveRoomSettings);
    refs.roomHomeBaseSaveBtn?.addEventListener('click', handleSaveHomeBase);
    refs.roomArtifactCreateBtn?.addEventListener('click', handleCreateArtifact);
    refs.roomActivityOpenBtn?.addEventListener('click', async () => {
      if (typeof appCtx.openActivityBrowser === 'function') {
        await appCtx.openActivityBrowser({ scope: 'rooms' });
      }
      closeRoomPanel();
    });
    refs.titleBrowseCityInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleBrowseRooms();
      }
    });
    refs.titleFriendUidInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleManualAddFriend();
      }
    });
    refs.titleFriendNameInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleManualAddFriend();
      }
    });
    refs.titleBrowseList?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest('button[data-room-code]');
      if (!button) return;
      const code = normalizeCode(button.dataset.roomCode || '');
      if (!code) return;
      setInputCode(refs, code);
      handleJoinRoom(code);
    });

    refs.titleFeaturedList?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest('button[data-room-code]');
      if (!button) return;
      const code = normalizeCode(button.dataset.roomCode || '');
      if (!code) return;
      setInputCode(refs, code);
      handleJoinRoom(code);
    });

    refs.titleFriendsList?.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const inviteBtn = target.closest('button[data-invite-friend]');
      if (inviteBtn instanceof HTMLElement) {
        const friendUid = sanitizeText(inviteBtn.dataset.inviteFriend || '', 80);
        if (friendUid) await handleInviteFriend(friendUid);
        return;
      }
      const removeBtn = target.closest('button[data-remove-friend]');
      if (removeBtn instanceof HTMLElement) {
        const friendUid = sanitizeText(removeBtn.dataset.removeFriend || '', 80);
        if (!friendUid) return;
        try {
          await removeFriend(friendUid);
          setStatus('Friend removed.');
        } catch (err) {
          setStatus(err?.message || 'Could not remove friend.', true);
        }
      }
    });

    refs.titleRecentPlayersList?.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const addBtn = target.closest('button[data-add-friend]');
      if (addBtn instanceof HTMLElement) {
        const friendUid = sanitizeText(addBtn.dataset.addFriend || '', 80);
        const playerName = sanitizeText(addBtn.dataset.playerName || 'Explorer', 48);
        if (friendUid) await handleAddFriend(friendUid, playerName, 'recent');
        return;
      }
      const joinBtn = target.closest('button[data-join-recent]');
      if (joinBtn instanceof HTMLElement) {
        const code = normalizeCode(joinBtn.dataset.joinRecent || '');
        if (code) {
          setInputCode(refs, code);
          await handleJoinRoom(code);
        }
      }
    });

    refs.titleInvitesList?.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const acceptBtn = target.closest('button[data-accept-invite]');
      if (acceptBtn instanceof HTMLElement) {
        const inviteId = sanitizeText(acceptBtn.dataset.acceptInvite || '', 128);
        const roomCode = normalizeCode(acceptBtn.dataset.roomCode || '');
        if (!inviteId || !roomCode) return;
        try {
          await markInviteSeen(inviteId, true);
          const canJoin = await ensureInviteJoinAccess();
          if (!canJoin) return;
          setInputCode(refs, roomCode);
          await handleJoinRoom(roomCode);
        } catch (err) {
          setStatus(err?.message || 'Could not accept invite.', true);
        }
        return;
      }
      const dismissBtn = target.closest('button[data-dismiss-invite]');
      if (dismissBtn instanceof HTMLElement) {
        const inviteId = sanitizeText(dismissBtn.dataset.dismissInvite || '', 128);
        if (!inviteId) return;
        try {
          await dismissInvite(inviteId);
          setStatus('Invite dismissed.');
        } catch (err) {
          setStatus(err?.message || 'Could not dismiss invite.', true);
        }
      }
    });

    refs.titleOwnedRoomsList?.addEventListener('click', async (event) => {
      const target = eventElementTarget(event);
      if (!target) return;

      const openBtn = target.closest('button[data-open-owned-room]');
      if (openBtn instanceof HTMLElement) {
        const roomCode = normalizeCode(openBtn.dataset.openOwnedRoom || '');
        if (!roomCode) return;
        await handleOpenOwnedRoom(roomCode);
        return;
      }

      const deleteBtn = target.closest('button[data-delete-owned-room]');
      if (deleteBtn instanceof HTMLElement) {
        const roomCode = normalizeCode(deleteBtn.dataset.deleteOwnedRoom || '');
        if (!roomCode) return;
        await handleDeleteOwnedRoom(roomCode);
        return;
      }

      const roomRow = target.closest('li[data-owned-room-code]');
      if (roomRow instanceof HTMLElement) {
        const roomCode = normalizeCode(roomRow.dataset.ownedRoomCode || '');
        if (!roomCode) return;
        await handleOpenOwnedRoom(roomCode);
      }
    });

    refs.titleOwnedRoomsList?.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = eventElementTarget(event);
      if (!target) return;
      const roomRow = target.closest('li[data-owned-room-code]');
      if (!(roomRow instanceof HTMLElement)) return;
      const roomCode = normalizeCode(roomRow.dataset.ownedRoomCode || '');
      if (!roomCode) return;
      event.preventDefault();
      await handleOpenOwnedRoom(roomCode);
    });

    refs.roomArtifactList?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const removeBtn = target.closest('button[data-remove-artifact]');
      if (!removeBtn) return;
      const artifactId = sanitizeText(removeBtn.dataset.removeArtifact || '', 160);
      if (!artifactId) return;
      handleRemoveArtifact(artifactId);
    });

    refs.roomActivityList?.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const openBtn = target.closest('button[data-open-room-activity]');
      if (openBtn instanceof HTMLElement) {
        const activityId = sanitizeText(openBtn.dataset.openRoomActivity || '', 120);
        if (activityId) await handleOpenRoomActivity(activityId);
        return;
      }
      const stopBtn = target.closest('button[data-stop-room-activity]');
      if (stopBtn instanceof HTMLElement) {
        const activityId = sanitizeText(stopBtn.dataset.stopRoomActivity || '', 120);
        if (activityId) await handleStopRoomActivity(activityId);
        return;
      }
      const removeBtn = target.closest('button[data-remove-room-activity]');
      if (removeBtn instanceof HTMLElement) {
        const activityId = sanitizeText(removeBtn.dataset.removeRoomActivity || '', 120);
        if (activityId) await handleDeleteRoomActivity(activityId);
      }
    });

    window.addEventListener('we3d-entitlements-changed', (event) => {
      const detail = event?.detail || {};
      state.entitlement = {
        ...state.entitlement,
        ...helpers.readPlanState(),
        plan: String(detail.plan || state.entitlement.plan || 'free').toLowerCase(),
        planLabel: String(detail.planLabel || state.entitlement.planLabel || 'Free')
      };
      if (!state.authUser && state.currentRoom) {
        deactivateRoom(true);
      }
      applyEntitlementCopy();
      attemptPendingRoomJoin();
      updateToggleStates();
    });

    const titleScreen = document.getElementById('titleScreen');
    if (titleScreen) {
      const observer = new MutationObserver(() => {
        const visible = !titleScreen.classList.contains('hidden');
        if (visible) {
          closeRoomPanel();
          setChatOpen(false);
        }
      });
      observer.observe(titleScreen, { attributes: true, attributeFilter: ['class'] });
    }
  }

  return {
    activateMultiplayerTabFromQuery,
    wireEvents,
    chatMaxLength: CHAT_MAX_LENGTH
  };
}

export { createUiRoomEventsApi };
