import { Body, Controller, Get, Param, Patch, Post, Query, ParseUUIDPipe } from '@nestjs/common';
import type { AuthenticatedUser } from '@/core/auth/auth-context';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import { Public } from '@/core/auth/public.decorator';
import { ZodValidationPipe } from '@/core/http/zod-validation.pipe';
import {
  createProfileSchema,
  type CreateProfileBody,
} from '@/modules/deals/http/schemas';
import { CreateOfferUseCase } from '../application/use-cases/create-offer.use-case';
import { GetMyProfileUseCase } from '../application/use-cases/get-my-profile.use-case';
import { CreateProfileUseCase } from '../application/use-cases/create-profile.use-case';
import { GetProfileByHandleUseCase } from '../application/use-cases/get-profile-by-handle.use-case';
import type { Offer, Profile } from '../domain/profile';
import { ListProfilesUseCase } from '../application/use-cases/list-profiles.use-case';
import { ListMyOffersUseCase } from '../application/use-cases/list-my-offers.use-case';
import { UpdateOfferUseCase } from '../application/use-cases/update-offer.use-case';
import { UpdateProfileUseCase } from '../application/use-cases/update-profile.use-case';
import { createOfferSchema, discoverySchema, updateOfferSchema, updateProfileSchema,
  type CreateOfferBody, type DiscoveryQuery, type UpdateOfferBody, type UpdateProfileBody } from './schemas';

function presentProfile(profile: Profile) {
  return {
    id: profile.id,
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio,
    availabilityStatus: profile.availabilityStatus,
    publishedAt: profile.publishedAt?.toISOString() ?? null,
    category: profile.settings?.category ?? null,
    location: profile.settings?.location ?? null,
    theme: profile.settings?.theme ?? 'dark',
    tabOrder: profile.settings?.tabOrder ?? ['content', 'offers', 'reputation'],
  };
}

function presentOffer(offer: Offer) {
  return {
    id: offer.id,
    kind: offer.kind,
    title: offer.title,
    description: offer.description,
    price: { amount: offer.priceMinor.toString(), currency: offer.currency },
    slaHours: offer.slaHours,
    revisionsIncluded: offer.revisionsIncluded,
    requiresBrief: offer.requiresBrief,
    status: offer.status,
  };
}

@Controller()
export class ProfilesController {
  constructor(
    private readonly createProfile: CreateProfileUseCase,
    private readonly createOffer: CreateOfferUseCase,
    private readonly getProfile: GetProfileByHandleUseCase,
    private readonly getMyProfile: GetMyProfileUseCase,
    private readonly listProfiles: ListProfilesUseCase,
    private readonly listMyOffers: ListMyOffersUseCase,
    private readonly updateProfile: UpdateProfileUseCase,
    private readonly updateOffer: UpdateOfferUseCase,
  ) {}

  @Public()
  @Get('profiles')
  async discover(@Query(new ZodValidationPipe(discoverySchema)) query: DiscoveryQuery) {
    const profiles = await this.listProfiles.execute(query.q);
    return { profiles: profiles.map(({ profile, offers }) => ({ ...presentProfile(profile), offers: offers.map(presentOffer) })) };
  }

  @Get('profiles/me/offers')
  async myOffers(@CurrentUser() auth: AuthenticatedUser) {
    const offers = await this.listMyOffers.execute(auth.userId);
    return { offers: offers.map(presentOffer) };
  }

  @Patch('profiles/me/offers/:id')
  async editOffer(@CurrentUser() auth: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateOfferSchema)) body: UpdateOfferBody) {
    return presentOffer(await this.updateOffer.execute(auth.userId, id, body));
  }

  @Patch('profiles/me')
  async editProfile(@CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileBody) {
    const profile = await this.updateProfile.execute(auth.userId, body);
    const offers = await this.listMyOffers.execute(auth.userId);
    return { ...presentProfile(profile), isOwner: true, settings: profile.settings ?? {}, offers: offers.map(presentOffer) };
  }

  /**
   * O perfil de quem está autenticado. Serve ao cliente para saber se este
   * utilizador vende ou só compra — 404 significa "só compra".
   */
  @Get('profiles/me')
  async mine(@CurrentUser() auth: AuthenticatedUser) {
    const { profile, offers } = await this.getMyProfile.execute(auth.userId);

    return { ...presentProfile(profile), isOwner: true, settings: profile.settings ?? {}, offers: offers.map(presentOffer) };
  }

  @Public()
  @Get('profiles/:handle')
  async byHandle(@Param('handle') handle: string) {
    const { profile, offers, availability, windows } = await this.getProfile.execute(handle);

    return {
      ...presentProfile(profile),
      // O derivado ganha ao guardado: é `NO_SLOTS` que aparece quando as vagas
      // acabam, sem nunca ter sido escrito em lado nenhum.
      availabilityStatus: availability,
      offers: offers.map(presentOffer),
      windows: windows.map((window) => ({
        id: window.id,
        offerId: window.offerId,
        startsAt: window.startsAt.toISOString(),
        endsAt: window.endsAt.toISOString(),
        slotsFree: Math.max(0, window.slotsTotal - window.slotsTaken),
        slotsTotal: window.slotsTotal,
      })),
    };
  }

  @Post('profiles')
  async create(
    @CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(createProfileSchema)) body: CreateProfileBody,
  ) {
    const profile = await this.createProfile.execute({
      actorUserId: auth.userId,
      handle: body.handle,
      displayName: body.displayName,
      bio: body.bio,
    });

    return presentProfile(profile);
  }

  @Post(['offers', 'profiles/me/offers'])
  async offer(
    @CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(createOfferSchema)) body: CreateOfferBody,
  ) {
    const offer = await this.createOffer.execute({
      actorUserId: auth.userId,
      kind: body.kind,
      title: body.title,
      description: body.description,
      priceMinor: body.priceMinor,
      slaHours: body.slaHours,
      revisionsIncluded: body.revisionsIncluded,
      requiresBrief: body.requiresBrief,
    });

    return presentOffer(offer);
  }
}
