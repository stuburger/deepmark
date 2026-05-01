import { Resource } from "sst"
import Stripe from "stripe"

let _stripe: Stripe | null = null

/** Lazy-init Stripe SDK; one instance per Lambda container. */
export function stripeClient(): Stripe {
	if (!_stripe) {
		_stripe = new Stripe(Resource.StripeSecretKey.value, {
			apiVersion: "2026-04-22.dahlia",
		})
	}
	return _stripe
}
