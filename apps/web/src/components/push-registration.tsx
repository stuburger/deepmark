"use client"

import {
	getVapidPublicKey,
	registerPushSubscription,
} from "@/lib/notifications/push"
import { useEffect } from "react"

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
	const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
	const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
	const rawData = atob(base64)
	const uint8 = Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
	return uint8.buffer
}

export function PushRegistration() {
	useEffect(() => {
		void registerServiceWorkerAndSubscribe()
	}, [])

	return null
}

async function registerServiceWorkerAndSubscribe() {
	if (
		!("serviceWorker" in navigator) ||
		!("PushManager" in window) ||
		Notification.permission === "denied"
	) {
		return
	}

	try {
		const registration = await navigator.serviceWorker.register("/sw.js")

		let permission: NotificationPermission = Notification.permission
		if (permission === "default") {
			permission = await Notification.requestPermission()
		}
		if (permission !== "granted") return

		const vapidResult = await getVapidPublicKey()
		if (!vapidResult?.data?.key) return
		const applicationServerKey = urlBase64ToUint8Array(vapidResult.data.key)

		const subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey,
		})

		const { endpoint, keys } = subscription.toJSON() as {
			endpoint: string
			keys: { p256dh: string; auth: string }
		}

		await registerPushSubscription({
			endpoint,
			p256dh: keys.p256dh,
			auth: keys.auth,
			userAgent: navigator.userAgent,
		})
	} catch {
		// Push registration failures are non-critical — teacher still gets in-app status
	}
}
