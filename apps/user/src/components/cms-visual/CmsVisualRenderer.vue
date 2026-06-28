<template>
  <view :class="rootClass" :style="rootStyle">
    <view
      v-for="(component, index) in visibleComponents"
      :key="component.id"
      :class="blockClass(component, index)"
      :style="blockStyle(component, index)"
    >
      <ThemeDynamicBackground v-if="showHeaderDynamicBackground(index)" :theme="props.theme" placement="absolute" />
      <video
        v-if="showHeaderVideo && index === 0"
        class="cms-header__video"
        :src="String(props.theme.backgroundVideoUrl)"
        :poster="String(props.theme.backgroundVideoPosterUrl || '')"
        autoplay
        loop
        muted
        playsinline
        webkit-playsinline
        object-fit="cover"
        :controls="false"
      />
      <FixedBusinessTemplateRenderer
        v-if="isFixedBusinessTemplate(component)"
        :kind="fixedTemplateKind(component)"
        :config="fixedTemplateConfig(component)"
        :context="fixedTemplateContext"
        :conferences="conferences"
        :products="products"
        :user-context="props.userContext"
        @open-conference="emit('openConference', $event)"
      />

      <view v-else-if="component.type === 'hero'" :class="heroClass(component)" :style="heroStyle(component)">
        <image
          v-if="stringConfig(component, 'imageUrl')"
          class="cms-hero__image"
          :src="stringConfig(component, 'imageUrl')"
          :mode="heroImageMode(component)"
        />
        <view v-else class="cms-hero__image cms-hero__image--generated" />
        <view v-if="showHeroShade(component)" class="cms-hero__shade" />
        <view v-if="showHeroContent(component)" class="cms-hero__content">
          <text v-if="heroKicker(component)" class="cms-hero__kicker">{{ heroKicker(component) }}</text>
          <text class="cms-hero__title" :style="titleStyle(component)">{{ heroTitle(component) }}</text>
          <text v-if="heroDescription(component)" class="cms-hero__desc" :style="textStyle(component)">{{ heroDescription(component) }}</text>
          <view v-if="heroMetaLines(component).length > 0" class="cms-hero__meta">
            <text v-for="line in heroMetaLines(component)" :key="line">{{ line }}</text>
          </view>
          <view v-if="booleanConfig(component, 'showButton', true)" class="cms-hero__button" @click="handleComponentAction(component)">
            <text>{{ stringConfig(component, "buttonText") || "立即报名" }}</text>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'conference-list'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "可报名会议" }}</text>
        <view v-if="conferences.length === 0" class="cms-empty">暂无可报名会议</view>
        <view v-for="(item, index) in limitedConferences(component)" :key="item.id" :class="conferenceCardClass(component, 'cms-card')" :style="conferenceCardStyle(component)">
          <image
            v-if="showConferenceCover(component, item)"
            :class="conferenceImageClass(component, 'cms-card__image')"
            :style="conferenceImageStyle(component)"
            :src="conferenceCoverUrl(item)"
            :mode="conferenceImageMode(component)"
            @error="markConferenceCoverFailed(item.id)"
          />
          <view
            v-else-if="booleanConfig(component, 'showCover', true)"
            :class="conferenceImageClass(component, 'cms-card__image cms-card__image--empty')"
            :style="conferenceImageStyle(component)"
          >
            <text>{{ conferenceCoverInitial(item) }}</text>
          </view>
          <view class="cms-card__body">
            <text class="cms-card__title" :style="conferenceTextStyle(component, 'title')">{{ item.title }}</text>
            <text v-if="booleanConfig(component, 'showSummary', true)" class="cms-card__text" :style="conferenceTextStyle(component, 'summary')">{{ item.summary || summaryFallback(component) }}</text>
            <text v-for="line in conferenceMetaLines(item, component, index)" :key="line" class="cms-card__meta" :style="conferenceTextStyle(component, 'meta')">{{ line }}</text>
            <view class="cms-card__button" @click.stop="handleConferenceAction(item, component)">
              <text>{{ conferenceActionText(item, component) }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'conference-schedule'" class="cms-section cms-schedule-page">
        <view class="cms-schedule-months">
          <view class="cms-schedule-months__rail">
            <view
              v-for="month in scheduleMonths(component)"
              :key="month.key"
              :class="['cms-schedule-month', activeScheduleMonth(component) === month.key ? 'active' : '']"
              @click="setScheduleMonth(component, month.key)"
            >
              <text>{{ month.year }}</text>
              <text>{{ month.label }}</text>
            </view>
          </view>
          <view v-if="booleanConfig(component, 'showCalendarButton', true)" class="cms-schedule-calendar" @click="addFirstScheduleToCalendar(component)">
            <text>▦</text>
            <text>{{ stringConfig(component, "calendarText") || "日历" }}</text>
          </view>
        </view>
        <view class="cms-schedule-categories">
          <text
            v-for="category in scheduleCategories(component)"
            :key="category"
            :class="['cms-schedule-category', activeScheduleCategory(component) === category ? 'active' : '']"
            @click="setScheduleCategory(component, category)"
          >
            {{ category }}
          </text>
        </view>
        <view v-if="scheduleConferences(component).length === 0" class="cms-empty">暂无该月份会议</view>
        <view v-for="item in scheduleConferences(component)" :key="item.id" class="cms-schedule-card">
          <image
            v-if="showConferenceCover(component, item)"
            class="cms-schedule-card__cover"
            :src="conferenceCoverUrl(item)"
            :mode="conferenceImageMode(component)"
            @error="markConferenceCoverFailed(item.id)"
          />
          <view v-else-if="booleanConfig(component, 'showCover', true)" class="cms-schedule-card__cover cms-card__image--empty">
            <text>{{ conferenceCoverInitial(item) }}</text>
          </view>
          <view class="cms-schedule-card__date">
            <text class="cms-schedule-card__day">{{ scheduleDay(item.startsAt) }}</text>
            <text>{{ scheduleWeekday(item.startsAt) }} {{ scheduleTimeRange(item.startsAt, item.endsAt) }}</text>
            <text class="cms-schedule-card__location">{{ item.location || "地点待定" }}</text>
          </view>
          <view class="cms-schedule-card__body">
            <view class="cms-schedule-card__tag">{{ scheduleCardTag(item, component) }}</view>
            <text class="cms-schedule-card__title">{{ item.title }}</text>
            <text v-if="item.summary" class="cms-schedule-card__summary">{{ item.summary }}</text>
            <view class="cms-schedule-card__meta">
              <text>已报名 {{ item.registrationCount || 0 }} 人</text>
              <text>{{ conferenceStatusText(item, component) }}</text>
            </view>
          </view>
          <view class="cms-schedule-card__actions">
            <view class="cms-schedule-card__button" @click.stop="handleConferenceAction(item, component)">
              <text>{{ conferenceActionText(item, component) }}</text>
            </view>
            <view v-if="booleanConfig(component, 'showItemCalendarButton', false)" class="cms-schedule-card__calendar" @click.stop="addConferenceToCalendar(item)">
              <text>日历</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'conference-tabs'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "会议分类切换" }}</text>
        <view class="cms-tabs">
          <text
            v-for="(tab, index) in conferenceTabItems(component)"
            :key="tab.label"
            :class="['cms-tab', index === 0 ? 'active' : '']"
            @click="submitTag(component, tab)"
          >
            {{ tab.label }}
          </text>
        </view>
        <view v-if="conferences.length === 0" class="cms-empty">暂无可报名会议</view>
        <view v-for="(item, index) in limitedConferences(component).slice(0, 3)" :key="item.id" :class="conferenceCardClass(component, 'cms-mini-card')" :style="conferenceCardStyle(component)">
          <image
            v-if="showConferenceCover(component, item)"
            :class="conferenceImageClass(component, 'cms-mini-card__image')"
            :style="conferenceImageStyle(component)"
            :src="conferenceCoverUrl(item)"
            :mode="conferenceImageMode(component)"
            @error="markConferenceCoverFailed(item.id)"
          />
          <view
            v-else-if="booleanConfig(component, 'showCover', true)"
            :class="conferenceImageClass(component, 'cms-mini-card__image cms-card__image--empty')"
            :style="conferenceImageStyle(component)"
          >
            <text>{{ conferenceCoverInitial(item) }}</text>
          </view>
          <view class="cms-card__body">
            <text class="cms-card__title" :style="conferenceTextStyle(component, 'title')">{{ item.title }}</text>
            <text v-if="booleanConfig(component, 'showSummary', false)" class="cms-card__text" :style="conferenceTextStyle(component, 'summary')">{{ item.summary || summaryFallback(component) }}</text>
            <text v-for="line in conferenceMetaLines(item, component, index)" :key="line" class="cms-card__meta" :style="conferenceTextStyle(component, 'meta')">{{ line }}</text>
            <view class="cms-card__button" @click.stop="handleConferenceAction(item, component)">
              <text>{{ conferenceActionText(item, component) }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'carousel'" :class="carouselClass(component)" :style="carouselStyle(component)">
        <swiper
          v-if="stringListConfig(component, 'images').length > 0"
          class="cms-swiper"
          :indicator-dots="booleanConfig(component, 'indicatorDots', true)"
          :circular="booleanConfig(component, 'circular', true)"
          :autoplay="booleanConfig(component, 'autoplay', true)"
        >
          <swiper-item v-for="image in stringListConfig(component, 'images')" :key="image">
            <view class="cms-swiper__slide">
              <image class="cms-swiper__image" :src="image" :mode="carouselImageMode(component)" />
            </view>
          </swiper-item>
        </swiper>
        <view v-else class="cms-empty cms-empty-card">暂无轮播图片</view>
      </view>

      <view v-else-if="component.type === 'hero-banner'" class="cms-home-hero" :style="homeHeroStyle(component)">
        <image v-if="stringConfig(component, 'imageUrl')" class="cms-home-hero__image" :src="stringConfig(component, 'imageUrl')" :mode="homeHeroImageMode(component)" />
        <view v-if="showHomeHeroShade(component)" class="cms-home-hero__shade" />
        <view v-if="showHomeHeroCopy(component)" class="cms-home-hero__copy">
          <text v-if="stringConfig(component, 'subtitle')" class="cms-home-hero__subtitle">{{ stringConfig(component, "subtitle") }}</text>
          <text v-if="stringConfig(component, 'title')" class="cms-home-hero__title" :style="homeTitleStyle(component)">{{ stringConfig(component, "title") }}</text>
          <text v-if="stringConfig(component, 'description')" class="cms-home-hero__desc" :style="homeTextStyle(component)">{{ stringConfig(component, "description") }}</text>
          <view class="cms-home-hero__actions">
            <view v-if="stringConfig(component, 'buttonText')" class="cms-home-hero__button" @click="handleComponentAction(component)">
              <text>{{ stringConfig(component, "buttonText") }}</text>
            </view>
            <view v-if="stringConfig(component, 'secondaryButtonText')" class="cms-home-hero__button is-secondary" @click="handleSecondaryComponentAction(component)">
              <text>{{ stringConfig(component, "secondaryButtonText") }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'login-card'" class="cms-section cms-login-card" :style="homePanelStyle(component)">
        <image v-if="loginCardAvatar(component)" class="cms-login-card__avatar" :src="loginCardAvatar(component)" mode="aspectFill" />
        <view v-else class="cms-login-card__avatar cms-login-card__avatar--text">{{ storedUser ? profileInitial : loginCardInitial(component) }}</view>
        <view class="cms-login-card__copy">
          <text class="cms-login-card__title" :style="titleStyle(component)">{{ loginCardTitle(component) }}</text>
          <text class="cms-login-card__subtitle" :style="textStyle(component)">{{ loginCardSubtitle(component) }}</text>
        </view>
        <view class="cms-login-card__button" @click="handleLoginCard(component)">
          <text>{{ storedUser ? stringConfig(component, "loggedInButtonText") || "查看权益" : stringConfig(component, "buttonText") || "立即登录" }}</text>
        </view>
      </view>

      <view v-else-if="component.type === 'quick-icon-grid' || component.type === 'service-shortcut-card'" class="cms-section cms-entry-section" :style="homePanelStyle(component)">
        <view v-if="moduleTitleVisible(component)" class="cms-module-head" :style="moduleHeadStyle(component)">
          <view class="cms-module-head__copy">
            <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || (component.type === "quick-icon-grid" ? "快捷入口" : "服务中心") }}</text>
            <text v-if="moduleSubtitle(component)" class="cms-module-head__subtitle" :style="subtitleStyle(component)">{{ moduleSubtitle(component) }}</text>
          </view>
          <text v-if="booleanConfig(component, 'showMore', false)" class="cms-module-head__more" @click="handleMoreAction(component)">{{ stringConfig(component, "moreText") || "查看更多" }}</text>
        </view>
        <scroll-view v-if="entryLayoutMode(component) === 'scroll'" scroll-x class="cms-entry-scroll">
          <view class="cms-entry-grid is-scroll" :style="homeGridStyle(component)">
            <view v-for="entry in homeEntries(component)" :key="entry.id || entry.title + entry.targetType + entry.targetValue" :class="homeEntryClass(component, entry)" :style="homeEntryStyle(component, entry)" @click="handleEntryAction(component, entry)">
              <image v-if="entry.dynamicIconUrl || entry.iconUrl" class="cms-entry-tile__icon" :class="entryIconClass(component)" :src="entry.dynamicIconUrl || entry.iconUrl" mode="aspectFit" />
              <view v-else class="cms-entry-tile__icon cms-entry-tile__icon--text" :class="entryIconClass(component)"><text>{{ builtinIconLabel(entry) }}</text></view>
              <text class="cms-entry-tile__title" :style="homeEntryTitleStyle(entry)">{{ entry.title }}</text>
              <text v-if="entry.subtitle && booleanConfig(component, 'showSubtitle', true)" class="cms-entry-tile__subtitle" :style="homeEntrySubtitleStyle(entry)">{{ entry.subtitle }}</text>
            </view>
          </view>
        </scroll-view>
        <view v-else class="cms-entry-grid" :style="homeGridStyle(component)">
          <view v-for="entry in homeEntries(component)" :key="entry.id || entry.title + entry.targetType + entry.targetValue" :class="homeEntryClass(component, entry)" :style="homeEntryStyle(component, entry)" @click="handleEntryAction(component, entry)">
            <image v-if="entry.dynamicIconUrl || entry.iconUrl" class="cms-entry-tile__icon" :class="entryIconClass(component)" :src="entry.dynamicIconUrl || entry.iconUrl" mode="aspectFit" />
            <view v-else class="cms-entry-tile__icon cms-entry-tile__icon--text" :class="entryIconClass(component)"><text>{{ builtinIconLabel(entry) }}</text></view>
            <text class="cms-entry-tile__title" :style="homeEntryTitleStyle(entry)">{{ entry.title }}</text>
            <text v-if="entry.subtitle && booleanConfig(component, 'showSubtitle', true)" class="cms-entry-tile__subtitle" :style="homeEntrySubtitleStyle(entry)">{{ entry.subtitle }}</text>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'member-promo-banner'" class="cms-member-promo" :style="homePanelStyle(component)" @click="handleComponentAction(component)">
        <image v-if="stringConfig(component, 'imageUrl')" class="cms-member-promo__image" :src="stringConfig(component, 'imageUrl')" mode="aspectFill" />
        <view class="cms-member-promo__copy">
          <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "会员权益" }}</text>
          <text v-if="stringConfig(component, 'subtitle')" class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "subtitle") }}</text>
          <text v-if="stringConfig(component, 'description')" class="cms-section__text">{{ stringConfig(component, "description") }}</text>
          <view v-if="stringConfig(component, 'buttonText')" class="cms-card__button"><text>{{ stringConfig(component, "buttonText") }}</text></view>
        </view>
      </view>

      <view v-else-if="component.type === 'event-card-carousel'" class="cms-section cms-event-carousel">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "精选会议" }}</text>
        <scroll-view scroll-x class="cms-event-carousel__rail">
          <view class="cms-event-carousel__track">
            <view v-for="(item, index) in carouselConferences(component)" :key="item.id" :class="eventCardClass(component)" @click="handleConferenceAction(item, component)">
              <image v-if="showConferenceCover(component, item)" class="cms-event-card__image" :src="conferenceCoverUrl(item)" :mode="conferenceImageMode(component)" @error="markConferenceCoverFailed(item.id)" />
              <view v-else class="cms-event-card__image cms-card__image--empty"><text>{{ conferenceCoverInitial(item) }}</text></view>
              <text class="cms-event-card__title">{{ item.title }}</text>
              <text v-if="booleanConfig(component, 'showSummary', true)" class="cms-event-card__text">{{ item.summary || summaryFallback(component) }}</text>
              <text v-for="line in conferenceMetaLines(item, component, index)" :key="line" class="cms-event-card__meta">{{ line }}</text>
              <view class="cms-card__button"><text>{{ conferenceActionText(item, component) }}</text></view>
            </view>
          </view>
        </scroll-view>
        <view v-if="carouselConferences(component).length === 0" class="cms-empty">暂无可展示会议</view>
      </view>

      <view v-else-if="component.type === 'task-progress-card'" class="cms-section cms-task-card" @click="handleComponentAction(component)">
        <view class="cms-task-card__head">
          <image v-if="stringConfig(component, 'iconUrl')" class="cms-task-card__icon" :src="stringConfig(component, 'iconUrl')" mode="aspectFit" />
          <view v-else class="cms-task-card__icon cms-entry-tile__icon--text"><text>任</text></view>
          <view class="cms-task-card__copy">
            <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "任务进度" }}</text>
            <text v-if="stringConfig(component, 'subtitle')" class="cms-section__text">{{ stringConfig(component, "subtitle") }}</text>
          </view>
          <text class="cms-task-card__count">{{ taskCurrent(component) }}/{{ taskTarget(component) }}</text>
        </view>
        <view class="cms-task-card__bar"><view :style="{ width: `${taskPercent(component)}%` }" /></view>
        <text v-if="stringConfig(component, 'ruleText') || stringConfig(component, 'description')" class="cms-section__text">{{ stringConfig(component, "ruleText") || stringConfig(component, "description") }}</text>
      </view>

      <view v-else-if="component.type === 'image-promo-card'" class="cms-section cms-image-promo" :style="imagePromoStyle(component)" @click="handleComponentAction(component)">
        <image v-if="stringConfig(component, 'imageUrl')" class="cms-section__image" :src="stringConfig(component, 'imageUrl')" mode="aspectFill" />
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "活动推荐" }}</text>
        <text v-if="stringConfig(component, 'subtitle')" class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "subtitle") }}</text>
        <view v-if="stringConfig(component, 'buttonText')" class="cms-card__button"><text>{{ stringConfig(component, "buttonText") }}</text></view>
      </view>

      <view v-else-if="isRichContentComponent(component)" :class="richContentClass(component)" :style="richContentStyle(component)">
        <view
          v-for="block in richContentBlocks(component)"
          :key="block.id"
          :class="richBlockClass(block)"
          :style="richBlockStyle(component, block)"
          @click.stop="handleRichBlockAction(component, block)"
        >
          <text v-if="block.type === 'heading'" class="cms-rich-content__heading" :style="richBlockHeadingStyle(component, block)">{{ block.title || "图文标题" }}</text>
          <text v-else-if="block.type === 'paragraph'" class="cms-rich-content__paragraph" :style="richBlockTextStyle(component, block)">{{ block.text || "请填写正文内容" }}</text>
          <view v-else-if="block.type === 'quote'" class="cms-rich-content__quote" :style="richBlockTextStyle(component, block)">
            <text>{{ block.text || "请填写重点提示" }}</text>
          </view>
          <view v-else-if="block.type === 'image'" class="cms-rich-content__figure">
            <image v-if="block.imageUrl" class="cms-rich-content__image" :style="richBlockImageStyle(component)" :src="block.imageUrl" :mode="richBlockImageMode(block)" />
            <view v-else class="cms-rich-content__image cms-rich-content__image--empty" :style="richBlockImageStyle(component)"><text>图片未配置</text></view>
            <text v-if="block.caption" class="cms-rich-content__caption">{{ block.caption }}</text>
          </view>
          <view v-else-if="block.type === 'button'" class="cms-rich-content__button">
            <text>{{ block.buttonText || "查看详情" }}</text>
          </view>
          <view v-else class="cms-rich-content__divider" />
        </view>
      </view>

      <view v-else-if="component.type === 'registration-button'" class="cms-register">
        <button class="cms-button" :style="textStyle(component)" @click="handleComponentAction(component)">{{ stringConfig(component, "text") || "立即报名" }}</button>
      </view>

      <button v-else-if="component.type === 'floating-registration-button'" class="cms-floating" :style="textStyle(component)" @click="handleComponentAction(component)">
        {{ stringConfig(component, "text") || "立即报名" }}
      </button>

      <view v-else-if="component.type === 'image-grid'" class="cms-grid">
        <image v-for="image in arrayConfig(component, 'images')" :key="String(image)" class="cms-grid__image" :src="String(image)" mode="aspectFill" />
        <view v-if="arrayConfig(component, 'images').length === 0" class="cms-empty cms-empty-card">暂无图片</view>
      </view>

      <view v-else-if="component.type === 'video'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "视频" }}</text>
        <video
          v-if="stringConfig(component, 'url')"
          class="cms-video"
          :src="stringConfig(component, 'url')"
          :poster="stringConfig(component, 'coverUrl')"
          :autoplay="false"
          playsinline
          webkit-playsinline
          controls
          object-fit="contain"
        />
        <view v-else class="cms-empty">视频地址未配置</view>
        <text v-if="stringConfig(component, 'description')" class="cms-section__text">{{ stringConfig(component, "description") }}</text>
      </view>

      <view v-else-if="component.type === 'speaker-cards'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "嘉宾阵容" }}</text>
        <view v-if="speakerItems(component).length === 0" class="cms-empty">嘉宾信息待公布</view>
        <view v-else class="cms-speakers">
          <view v-for="speaker in speakerItems(component)" :key="speaker.name + speaker.role" class="cms-speaker">
            <image v-if="speaker.avatarUrl" class="cms-speaker__avatar" :src="speaker.avatarUrl" mode="aspectFill" />
            <view v-else class="cms-speaker__avatar cms-speaker__avatar--text">{{ speaker.initial }}</view>
            <view class="cms-speaker__body">
              <text class="cms-speaker__name" :style="textStyle(component)">{{ speaker.name }}</text>
              <text v-if="speaker.role" class="cms-speaker__role">{{ speaker.role }}</text>
              <text v-if="speaker.bio" class="cms-speaker__bio">{{ speaker.bio }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'schedule-timeline'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "会议日程" }}</text>
        <view v-if="scheduleItems(component).length === 0" class="cms-empty">日程安排待公布</view>
        <view v-else class="cms-timeline">
          <view v-for="item in scheduleItems(component)" :key="item.time + item.title" class="cms-timeline__item">
            <text class="cms-timeline__time">{{ item.time || "待定" }}</text>
            <view class="cms-timeline__content">
              <text class="cms-timeline__title" :style="textStyle(component)">{{ item.title }}</text>
              <text v-if="item.description" class="cms-timeline__desc">{{ item.description }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'countdown'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "距离开始" }}</text>
        <view v-if="countdownParts(component) && !countdownEnded(component)" class="cms-countdown">
          <view v-for="part in countdownParts(component)" :key="part.label" class="cms-countdown__item">
            <text class="cms-countdown__value">{{ part.value }}</text>
            <text class="cms-countdown__label">{{ part.label }}</text>
          </view>
        </view>
        <view v-else-if="countdownEnded(component)" class="cms-empty">{{ stringConfig(component, "endedText") || "活动已开始" }}</view>
        <view v-else class="cms-empty">倒计时时间待配置</view>
      </view>

      <view v-else-if="component.type === 'notice'" class="cms-notice" :style="textStyle(component)">
        {{ stringConfig(component, "text") || "报名开放中" }}
      </view>

      <view v-else-if="component.type === 'promotion-bar'" class="cms-notice cms-link-bar" :style="promotionBarStyle(component)" @click="handleComponentAction(component)">
        <view class="cms-link-bar__left">
          <text class="cms-link-bar__icon">{{ stringConfig(component, "iconText") || "▰" }}</text>
          <text class="cms-link-bar__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || stringConfig(component, "text") || "五大增量生态 × 五大垂类赛道" }}</text>
        </view>
        <view v-if="stringConfig(component, 'buttonText') || booleanConfig(component, 'showArrow', true)" class="cms-link-bar__action">
          <text v-if="stringConfig(component, 'buttonText')">{{ stringConfig(component, "buttonText") }}</text>
          <text v-if="booleanConfig(component, 'showArrow', true)" class="cms-link-bar__arrow">›</text>
        </view>
      </view>

      <view v-else-if="component.type === 'stats-grid'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "会议亮点" }}</text>
        <view class="cms-stats">
          <text v-for="item in arrayConfig(component, 'items')" :key="String(item)" class="cms-stat" :style="textStyle(component)">{{ item }}</text>
        </view>
      </view>

      <view v-else-if="component.type === 'dual-track-tags'" class="cms-section cms-track-tags" :style="homePanelStyle(component)">
        <view v-for="(row, rowIndex) in dualTrackRows(component)" :key="row.title" class="cms-track-tags__row">
          <text class="cms-track-tags__title" :style="titleStyle(component)">{{ row.title }}</text>
          <view class="cms-track-tags__chips">
            <text v-for="item in row.items" :key="item" class="cms-track-tags__chip" :style="textStyle(component)">{{ item }}</text>
          </view>
          <view v-if="row.buttonText" class="cms-track-tags__button" @click="handleDualTrackAction(component, rowIndex)">
            <text>{{ row.buttonText }}</text>
            <text>›</text>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'search'" class="cms-section cms-search">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "搜索会议" }}</text>
        <view class="cms-search__row">
          <input
            class="cms-search__input"
            :value="searchValue(component)"
            :placeholder="stringConfig(component, 'placeholder') || '输入会议关键词'"
            confirm-type="search"
            @input="setSearchValue(component, $event)"
            @confirm="submitSearch(component)"
          />
          <button class="cms-search__button" @click="submitSearch(component)">{{ stringConfig(component, "buttonText") || "搜索" }}</button>
        </view>
      </view>

      <view v-else-if="component.type === 'coupon-card'" class="cms-section cms-coupon" @click="handleCouponCard(component)">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "领取会议优惠券" }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "description") || "登录后可领取可用优惠券，创建订单时由系统重新计价。" }}</text>
        <text v-if="couponStatus(component)" class="cms-section__text">{{ couponStatus(component) }}</text>
        <view class="cms-card__button"><text>{{ stringConfig(component, "buttonText") || "去领取" }}</text></view>
      </view>

      <view v-else-if="component.type === 'membership-benefits'" class="cms-section cms-member">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "会员权益" }}</text>
        <text class="cms-section__text">会员价以创建订单时后端计价结果为准；会员购买支付暂未开放，会员状态以后台授予和续期为准。</text>
        <view class="cms-list-lines">
          <text v-for="item in fallbackList(component, ['会员专属权益', '会员价规则以后台配置为准'])" :key="item" class="cms-list-line" :style="textStyle(component)">{{ item }}</text>
        </view>
        <view class="cms-card__button" @click="goLoginPath('/pages/member/center')"><text>{{ stringConfig(component, "buttonText") || "查看会员中心" }}</text></view>
      </view>

      <view v-else-if="component.type === 'user-profile-card'" class="cms-section cms-profile" @click="goLoginPath(profileTargetPath(component))">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "我的资料" }}</text>
        <view class="cms-profile__body">
          <image v-if="storedUser?.wechatAvatarUrl" class="cms-profile__avatar" :src="storedUser.wechatAvatarUrl" mode="aspectFill" />
          <view v-else class="cms-profile__avatar cms-profile__avatar--text">{{ storedUser ? profileInitial : "登" }}</view>
          <view class="cms-profile__meta">
            <text class="cms-profile__name">{{ storedUser?.wechatNickname || storedUser?.nickname || "登录后查看资料" }}</text>
            <text class="cms-section__text" :style="textStyle(component)">{{ storedUser ? "可查看会员状态、报名和订单信息。" : stringConfig(component, "description") || "登录后查看头像、昵称、手机号和会员状态。" }}</text>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'my-order-list'" class="cms-section cms-orders">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "我的订单" }}</text>
        <view class="cms-action-grid">
          <view v-if="showRegistrationOrders(component)" class="cms-action-tile" @click="goLoginPath('/pages/registrations/my')"><text>会议报名</text></view>
          <view v-if="showMallOrders(component)" class="cms-action-tile" @click="goLoginPath('/pages/mall/orders')"><text>商城订单</text></view>
        </view>
        <view v-if="!storedUser" class="cms-empty">登录后查看你的报名订单和商城订单。</view>
      </view>

      <view v-else-if="component.type === 'mall-product-grid'" class="cms-section cms-mall">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "商城商品" }}</text>
        <view v-if="mallProductLoading[component.id]" class="cms-empty">商品加载中</view>
        <view v-else-if="mallProducts(component).length === 0" class="cms-empty">暂无可展示商品</view>
        <view v-else class="cms-product-grid">
          <view v-for="item in mallProducts(component)" :key="item.id" class="cms-product-card" @click="goPath(`/pages/mall/detail?id=${encodeURIComponent(item.id)}`)">
            <image v-if="item.coverImageUrl" class="cms-product-card__image" :src="item.coverImageUrl" mode="aspectFill" />
            <view v-else class="cms-product-card__image"><text>{{ item.title.slice(0, 1) }}</text></view>
            <text class="cms-product-card__title">{{ item.title }}</text>
            <view class="cms-product-card__footer">
              <text class="cms-product-card__meta">{{ item.availableStock > 0 ? mallProductPriceText(item) : "售罄" }}</text>
              <view class="cms-product-card__cart" @click.stop="addMallProductToCart(item, component)">
                <text>{{ stringConfig(component, "buttonText") || "加入购物车" }}</text>
              </view>
            </view>
          </view>
        </view>
        <view v-if="booleanConfig(component, 'showMoreButton', false)" class="cms-card__button" @click="goPath(mallListPath(component))"><text>{{ stringConfig(component, "moreButtonText") || "查看更多" }}</text></view>
      </view>

      <view v-else-if="component.type === 'tag-filter'" class="cms-section cms-tags">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "热门主题" }}</text>
        <view v-if="tagItems(component).length === 0" class="cms-empty">暂无标签</view>
        <view v-else class="cms-tag-list">
          <text v-for="item in tagItems(component)" :key="item.label" class="cms-tag" @click="submitTag(component, item)">{{ item.label }}</text>
        </view>
      </view>

      <view v-else-if="component.type === 'download-list'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "资料下载" }}</text>
        <view v-if="downloadItems(component).length === 0" class="cms-empty">资料待补充</view>
        <view v-else class="cms-list-lines">
          <view v-for="item in downloadItems(component)" :key="item.name + item.url" class="cms-list-line" @click="openOrCopyLink(item.url, item.name)">
            <text>{{ item.name }}</text>
            <text v-if="item.description" class="cms-list-line__desc">{{ item.description }}</text>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'testimonial-list'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "参会评价" }}</text>
        <view v-if="testimonialItems(component).length === 0" class="cms-empty">评价待补充</view>
        <view v-else class="cms-testimonials">
          <view v-for="item in testimonialItems(component)" :key="item.name + item.content" class="cms-testimonial">
            <image v-if="item.avatarUrl" class="cms-testimonial__avatar" :src="item.avatarUrl" mode="aspectFill" />
            <view v-else class="cms-testimonial__avatar cms-testimonial__avatar--text">{{ item.name.slice(0, 1) || "评" }}</view>
            <view class="cms-testimonial__body">
              <text class="cms-testimonial__content">{{ item.content }}</text>
              <text class="cms-testimonial__name">{{ item.name }}{{ item.company ? ` · ${item.company}` : "" }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'ticket-price-list' || component.type === 'process-steps'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || titleFor(component.type) }}</text>
        <view class="cms-list-lines">
          <text v-for="item in arrayConfig(component, 'items')" :key="String(item)" class="cms-list-line" :style="textStyle(component)">{{ item }}</text>
        </view>
      </view>

      <view v-else-if="component.type === 'live-card'" class="cms-section cms-live">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "线上直播" }}</text>
        <image v-if="stringConfig(component, 'coverUrl')" class="cms-section__image" :src="stringConfig(component, 'coverUrl')" mode="aspectFill" />
        <text class="cms-section__text" :style="textStyle(component)">{{ liveStatusText(component) }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "text") || stringConfig(component, "platform") || "无法到场也可预约线上观看" }}</text>
        <view class="cms-card__button" @click="openOrCopyLink(stringConfig(component, 'url'), stringConfig(component, 'title') || '直播链接')"><text>{{ stringConfig(component, "buttonText") || "打开直播" }}</text></view>
      </view>

      <view v-else-if="component.type === 'traffic-guide'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "交通指南" }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "address") }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "text") }}</text>
        <view class="cms-action-grid">
          <view class="cms-action-tile" @click="copyText(stringConfig(component, 'address'), '地址已复制')"><text>复制地址</text></view>
          <view v-if="stringConfig(component, 'mapUrl')" class="cms-action-tile" @click="openOrCopyLink(stringConfig(component, 'mapUrl'), '地图链接')"><text>打开地图</text></view>
          <view v-if="stringConfig(component, 'phone')" class="cms-action-tile" @click="callPhone(stringConfig(component, 'phone'))"><text>拨打电话</text></view>
        </view>
      </view>

      <view v-else-if="component.type === 'map-contact'" class="cms-section cms-map-contact">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "会场与联系" }}</text>
        <view class="cms-map-contact__body">
          <text v-if="stringConfig(component, 'contactName')" class="cms-section__text" :style="textStyle(component)">联系人：{{ stringConfig(component, "contactName") }}</text>
          <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "address") || conference?.location || "会议地址待公布" }}</text>
          <button v-if="stringConfig(component, 'phone')" class="cms-button cms-button--outline" @click="callPhone(stringConfig(component, 'phone'))">
            联系会务组：{{ stringConfig(component, "phone") }}
          </button>
          <button class="cms-button cms-button--outline" @click="copyText(stringConfig(component, 'address') || conference?.location || '', '地址已复制')">复制地址</button>
          <button v-if="stringConfig(component, 'mapUrl')" class="cms-button cms-button--outline" @click="openOrCopyLink(stringConfig(component, 'mapUrl'), '地图链接')">打开地图链接</button>
        </view>
      </view>

      <view v-else-if="component.type === 'sponsor-wall'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "合作伙伴" }}</text>
        <view v-if="sponsorItems(component).length === 0" class="cms-empty">合作伙伴待公布</view>
        <view v-else class="cms-sponsors">
          <view v-for="sponsor in sponsorItems(component)" :key="sponsor.name + sponsor.logoUrl" class="cms-sponsor" @click="openOrCopyLink(sponsor.url, sponsor.name)">
            <image v-if="sponsor.logoUrl" class="cms-sponsor__logo" :src="sponsor.logoUrl" mode="aspectFit" />
            <text v-else class="cms-sponsor__name">{{ sponsor.name }}</text>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'faq'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "常见问题" }}</text>
        <view v-if="faqItems(component).length === 0" class="cms-empty">常见问题待补充</view>
        <view v-else class="cms-faq">
          <view v-for="(item, faqIndex) in faqItems(component)" :key="item.question" class="cms-faq__item" @click="toggleFaq(component, faqIndex)">
            <text class="cms-faq__question" :style="textStyle(component)">{{ item.question }}</text>
            <text v-if="item.answer && isFaqOpen(component, faqIndex)" class="cms-faq__answer">{{ item.answer }}</text>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'contact-card'" class="cms-section cms-contact">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "咨询报名" }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "text") || "如需团体报名，请联系会务组。" }}</text>
        <button v-if="stringConfig(component, 'phone')" class="cms-button">{{ stringConfig(component, "phone") }}</button>
      </view>

      <view v-else-if="component.type === 'title'" class="cms-title" :style="textStyle(component)">{{ stringConfig(component, "text") || "标题" }}</view>

      <view v-else-if="component.type === 'divider'" class="cms-divider" />

      <view v-else-if="component.type === 'spacer'" :style="{ height: `${numberConfig(component, 'height', 24)}rpx` }" />

      <view v-else class="cms-section cms-unsupported">
        <text class="cms-section__title">组件暂不可用</text>
        <text class="cms-section__text">{{ unsupportedComponentText(component) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { getModuleRenderContractForVisualComponent, type ModuleRenderContract, type RendererPlatform } from "@conference/business-modules";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import FixedBusinessTemplateRenderer from "@/components/fixed-templates/FixedBusinessTemplateRenderer.vue";
import { ensureLogin, getStoredUser } from "@/services/auth";
import type { CmsComponent, ThemeConfig } from "@/services/cms";
import { reserveConferenceAppointment, type ConferenceDetail, type ConferenceListItem } from "@/services/conference";
import { getProducts, type Product } from "@/services/mall";
import { claimCoupon, getCouponCampaignPublic } from "@/services/operations";
import { addProductCartItem } from "@/services/cart";
import { createCmsBackgroundStyle, createCmsThemeVars } from "@/theme/cmsTheme";
import { getCmsComponentSupport, isCmsRegistrationCta } from "@/utils/cmsComponents";
import { formatDateTime } from "@/utils/date";
import { formatCent } from "@/utils/money";
import { stringifyQuery } from "@/utils/query";

const emit = defineEmits<{
  openConference: [id: string];
  register: [];
}>();

const props = defineProps<{
  components: CmsComponent[];
  theme: ThemeConfig;
  conferences?: ConferenceListItem[];
  conference?: ConferenceDetail | null;
  products?: Product[];
  userContext?: Record<string, unknown> | null;
  suppressRegistrationCta?: boolean;
}>();

const nowTimestamp = ref(Date.now());
const failedConferenceCoverIds = ref<Set<string>>(new Set());
const searchValues = ref<Record<string, string>>({});
const faqOpenMap = ref<Record<string, boolean>>({});
const mallProductMap = ref<Record<string, Product[]>>({});
const mallProductLoading = ref<Record<string, boolean>>({});
const couponStatusMap = ref<Record<string, string>>({});
const scheduleMonthMap = ref<Record<string, string>>({});
const scheduleCategoryMap = ref<Record<string, string>>({});
let countdownTimer: ReturnType<typeof setInterval> | undefined;

const visualPlatform = computed<RendererPlatform>(() => (typeof window === "undefined" ? "miniapp" : "h5"));
const visibleComponents = computed(() =>
  props.components
    .filter((item) => item.enabled)
    .filter((item) => !(props.suppressRegistrationCta && isCmsRegistrationCta(normalizedComponentType(item))))
    .sort((a, b) => a.sortOrder - b.sortOrder)
);
const conferences = computed(() => props.conferences ?? []);
const products = computed(() => props.products ?? []);
const storedUser = ref(getStoredUser());
const profileInitial = computed(() => (storedUser.value?.wechatNickname || storedUser.value?.nickname || "用").slice(0, 1));
const rootStyle = computed(() => ({
  ...createCmsThemeVars(props.theme)
}));
const rootClass = computed(() => ["cms-page"]);
const showHeaderVideo = computed(() => props.theme.backgroundMode === "video" && Boolean(props.theme.backgroundVideoUrl) && props.theme.backgroundApplyTo === "header");
const fixedTemplateContext = computed(() => ({
  theme: props.theme,
  userContext: props.userContext ?? null,
  conferences: props.conferences ?? [],
  products: props.products ?? []
}));

async function handleComponentAction(component: CmsComponent) {
  await runAction(readComponentAction(component));
}

async function handleSecondaryComponentAction(component: CmsComponent) {
  await runAction(readComponentAction(component, "secondary"));
}

function pagePath(pageKey: string) {
  const builtin: Record<string, string> = {
    home: "/pages/index/index",
    "conference-list": "/pages/custom/index?pageKey=conference-list",
    "conference-detail": props.conference?.id ? `/pages/conference/detail?id=${encodeURIComponent(props.conference.id)}` : "/pages/index/index",
    "registration-form": props.conference?.id ? `/pages/registration/form?conferenceId=${encodeURIComponent(props.conference.id)}` : "/pages/index/index",
    "registration-success": "/pages/registrations/my",
    "my-registrations": "/pages/registrations/my",
    cart: "/pages/cart/index",
    "member-center": "/pages/member/center",
    mall: "/pages/mall/index",
    "mall-detail": "/pages/mall/index",
    "mall-orders": "/pages/mall/orders",
    invoice: "/pages/invoice/index",
    "ai-assistant": props.conference?.id ? `/pages/ai-assistant/index?conferenceId=${encodeURIComponent(props.conference.id)}` : "/pages/ai-assistant/index"
  };
  if (pageKey.startsWith("custom:")) {
    return `/pages/custom/index?pageKey=${encodeURIComponent(pageKey.slice("custom:".length))}`;
  }
  return builtin[pageKey] ?? `/pages/custom/index?pageKey=${encodeURIComponent(pageKey)}`;
}

function showTargetMissing(title: string) {
  uni.showToast({ title, icon: "none" });
}

onMounted(() => {
  loadCustomFonts();
  refreshStoredUser();
  uni.$on("wechat-profile:updated", handleWechatProfileUpdated);
  void loadMallProductComponents();
  countdownTimer = setInterval(() => {
    nowTimestamp.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  uni.$off("wechat-profile:updated", handleWechatProfileUpdated);
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
});
watch(() => props.components, loadCustomFonts, { deep: true });
watch(() => props.components, () => void loadMallProductComponents(), { deep: true });
watch(
  () => conferences.value.map((item) => `${item.id}:${item.coverImageUrl ?? ""}`).join("|"),
  () => {
    failedConferenceCoverIds.value = new Set();
  }
);

function stringConfig(component: CmsComponent, key: string): string {
  const value = component.config?.[key];
  return typeof value === "string" ? value : "";
}

function numberConfig(component: CmsComponent, key: string, fallback: number): number {
  const value = component.config?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function intConfig(component: CmsComponent, key: string, fallback: number): number {
  const value = component.config?.[key];
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

function booleanConfig(component: CmsComponent, key: string, fallback = false): boolean {
  const value = component.config?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function headerBackgroundStyle(): Record<string, string> {
  return createCmsBackgroundStyle(props.theme, "header");
}

function blockClass(component: CmsComponent, index: number): string[] {
  return [
    "cms-block",
    props.theme.backgroundApplyTo === "header" && index === 0 ? "is-header-block" : "",
    isGenericFullBleed(component) ? "is-component-full-bleed" : "",
    isComponentTransparent(component) ? "is-component-transparent" : "",
    entryTilesUseTransparentBackground(component) ? "is-entry-tiles-transparent" : ""
  ].filter(Boolean);
}

function blockStyle(component: CmsComponent, index: number): Record<string, string> {
  const style: Record<string, string> = {};
  const marginTop = numberConfig(component, "moduleSpacingTop", 0);
  const minHeight = numberConfig(component, "moduleHeight", 0);
  const opacity = numberConfig(component, "moduleOpacity", 100);
  if (index > 0) style.marginTop = `${marginTop}rpx`;
  if (minHeight > 0) style.minHeight = `${minHeight}rpx`;
  if (opacity >= 0 && opacity < 100) style.opacity = `${Math.max(0, Math.min(100, opacity)) / 100}`;
  if (index === 0 && props.theme.backgroundApplyTo === "header") {
    Object.assign(style, headerBackgroundStyle());
  }
  return style;
}

function showHeaderDynamicBackground(index: number): boolean {
  return index === 0 && props.theme.backgroundApplyTo === "header" && props.theme.backgroundMode === "dynamic-gradient";
}

function isGenericFullBleed(component: CmsComponent): boolean {
  if (!booleanConfig(component, "fullBleed", false)) return false;
  return !["hero", "hero-banner", "carousel", "floating-registration-button"].includes(component.type);
}

function componentContainerStyle(component: CmsComponent): "card" | "transparent" {
  const value = stringConfig(component, "contentBackgroundStyle") || stringConfig(component, "containerStyle");
  if (value === "transparent") return "transparent";
  if (value === "card") return "card";
  return isRichContentComponent(component) ? "transparent" : "card";
}

function isComponentTransparent(component: CmsComponent): boolean {
  return componentContainerStyle(component) === "transparent";
}

function entryTilesUseTransparentBackground(component: CmsComponent): boolean {
  if (!["quick-icon-grid", "service-shortcut-card"].includes(component.type)) return false;
  return isComponentTransparent(component) && !stringConfig(component, "cardBackground");
}

function arrayConfig(component: CmsComponent, key: string): unknown[] {
  const value = component.config?.[key];
  return Array.isArray(value) ? value : [];
}

interface SpeakerItem {
  name: string;
  role: string;
  bio: string;
  avatarUrl: string;
  initial: string;
}

interface ScheduleItem {
  time: string;
  title: string;
  description: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface SponsorItem {
  name: string;
  logoUrl: string;
  url: string;
}

interface CountdownPart {
  label: string;
  value: string;
}

interface TagFilterItem {
  label: string;
  value: string;
  target: string;
}

interface HomeEntryItem {
  id: string;
  enabled: boolean;
  sort: number;
  title: string;
  subtitle: string;
  iconUrl: string;
  dynamicIconUrl: string;
  builtinIcon: string;
  backgroundColor: string;
  textColor: string;
  cardStyle: string;
  targetType: string;
  targetValue: string;
  pageKey: string;
  conferenceId: string;
  productId: string;
  productCategoryId: string;
  couponCampaignId: string;
  externalUrl: string;
  miniappAppId: string;
  miniappPath: string;
  miniappExtraData: string;
  phone: string;
  copyText: string;
  copySuccessText: string;
}

interface CmsActionConfig {
  type: string;
  pageKey: string;
  conferenceId: string;
  productId: string;
  productCategoryId: string;
  couponCampaignId: string;
  externalUrl: string;
  miniappAppId: string;
  miniappPath: string;
  miniappExtraData: string;
  phone: string;
  copyText: string;
}

interface DualTrackRow {
  title: string;
  items: string[];
  buttonText: string;
}

interface RichContentBlockItem {
  id: string;
  enabled: boolean;
  sort: number;
  type: "heading" | "paragraph" | "image" | "quote" | "divider" | "button";
  title: string;
  text: string;
  imageUrl: string;
  caption: string;
  imageMode: string;
  align: string;
  buttonText: string;
  actionTargetType: string;
  targetPageKey: string;
  targetConferenceId: string;
  targetProductId: string;
  targetProductCategoryId: string;
  targetCouponCampaignId: string;
  externalUrl: string;
  externalMiniappAppId: string;
  externalMiniappPath: string;
  phone: string;
  copyText: string;
}

interface DownloadItem {
  name: string;
  url: string;
  description: string;
}

interface TestimonialItem {
  content: string;
  name: string;
  company: string;
  avatarUrl: string;
}

function stringListConfig(component: CmsComponent, key: string): string[] {
  return arrayConfig(component, key).map((item) => String(item).trim()).filter(Boolean);
}

function homeEntries(component: CmsComponent): HomeEntryItem[] {
  const items = arrayConfig(component, "items")
    .map((item, index) => normalizeHomeEntry(item, index))
    .filter((item) => item.enabled !== false && item.title)
    .sort((a, b) => a.sort - b.sort);
  if (items.length > 0) return items;
  if (component.type === "service-shortcut-card") {
    return [
      normalizeHomeEntry({ title: "我的报名", subtitle: "查看凭证", builtinIcon: "registration", actionTargetType: "page", targetPageKey: "my-registrations" }, 0),
      normalizeHomeEntry({ title: "商城订单", subtitle: "商品订单", builtinIcon: "order", actionTargetType: "page", targetPageKey: "mall-orders" }, 1),
      normalizeHomeEntry({ title: "发票申请", subtitle: "提交发票", builtinIcon: "invoice", actionTargetType: "invoice" }, 2),
      normalizeHomeEntry({ title: "联系客服", subtitle: "复制信息", builtinIcon: "service", actionTargetType: "copy", copyText: "请联系会务组" }, 3)
    ];
  }
  return [
    normalizeHomeEntry({ title: "会议报名", subtitle: "Registration", builtinIcon: "registration", actionTargetType: "page", targetPageKey: "conference-list" }, 0),
    normalizeHomeEntry({ title: "我的报名", subtitle: "My tickets", builtinIcon: "order", actionTargetType: "page", targetPageKey: "my-registrations" }, 1),
    normalizeHomeEntry({ title: "商城", subtitle: "Shop", builtinIcon: "shop", actionTargetType: "page", targetPageKey: "mall" }, 2)
  ];
}

function normalizeHomeEntry(value: unknown, index: number): HomeEntryItem {
  if (isRecord(value)) {
    const type = firstString(value, ["actionTargetType", "targetType", "actionType", "type"]) || "none";
    const fallbackTarget = firstString(value, ["targetValue", "target"]);
    return {
      id: firstString(value, ["id"]) || `entry-${index}`,
      enabled: typeof value.enabled === "boolean" ? value.enabled : true,
      sort: Number.isFinite(Number(value.sort)) ? Number(value.sort) : index * 10 + 10,
      title: firstString(value, ["title", "name", "label", "text"]) || "入口",
      subtitle: firstString(value, ["subtitle", "description", "desc", "englishTitle"]) || "",
      iconUrl: firstString(value, ["iconUrl", "imageUrl", "icon", "image"]) || "",
      dynamicIconUrl: firstString(value, ["dynamicIconUrl", "animatedIconUrl"]) || "",
      builtinIcon: firstString(value, ["builtinIcon"]) || "",
      backgroundColor: firstString(value, ["backgroundColor"]) || "",
      textColor: firstString(value, ["textColor"]) || "",
      cardStyle: firstString(value, ["cardStyle"]) || "",
      targetType: type,
      targetValue: fallbackTarget,
      pageKey: firstString(value, ["targetPageKey", "pageKey"]) || (type === "page" ? fallbackTarget : ""),
      conferenceId: firstString(value, ["targetConferenceId", "conferenceId"]) || (type === "conference" || type === "registration" || type === "ai" ? fallbackTarget : ""),
      productId: firstString(value, ["targetProductId", "productId"]) || (type === "product" ? fallbackTarget : ""),
      productCategoryId: firstString(value, ["targetProductCategoryId", "productCategoryId"]) || (type === "product-category" ? fallbackTarget : ""),
      couponCampaignId: firstString(value, ["targetCouponCampaignId", "couponCampaignId"]) || (type === "coupon" ? fallbackTarget : ""),
      externalUrl: firstString(value, ["externalUrl", "url"]) || (type === "external-h5" ? fallbackTarget : ""),
      miniappAppId: firstString(value, ["externalMiniappAppId", "miniappAppId"]) || (type === "external-miniapp" ? fallbackTarget : ""),
      miniappPath: firstString(value, ["externalMiniappPath", "miniappPath"]) || "",
      miniappExtraData: firstString(value, ["externalMiniappExtraData", "miniappExtraData"]) || "",
      phone: firstString(value, ["phone"]) || (type === "phone" ? fallbackTarget : ""),
      copyText: firstString(value, ["copyText"]) || (type === "copy" ? fallbackTarget : ""),
      copySuccessText: firstString(value, ["copySuccessText"]) || "内容已复制"
    };
  }

  const parts = splitEntryLine(String(value));
  const type = parts[3] || (parts[2] && !looksLikeImageUrl(parts[2]) ? parts[2] : "none");
  const targetValue = parts[4] || "";
  return normalizeHomeEntry(
    {
      id: `entry-${index}`,
      enabled: true,
      sort: index * 10 + 10,
      title: parts[0] || "入口",
      subtitle: parts[1] || "",
      iconUrl: looksLikeImageUrl(parts[2] || "") ? parts[2] : "",
      actionTargetType: type,
      targetValue
    },
    index
  );
}

function isRichContentComponent(component: CmsComponent): boolean {
  return ["rich-content-block", "rich-text", "safe-html", "text-image"].includes(component.type);
}

function richContentBlocks(component: CmsComponent): RichContentBlockItem[] {
  const configured = arrayConfig(component, "blocks");
  const source = configured.length > 0 ? configured : legacyRichContentBlocks(component);
  return source
    .map((item, index) => normalizeRichContentBlock(item, index))
    .filter((item) => item.enabled !== false)
    .filter((item) => item.type === "divider" || item.title || item.text || item.imageUrl || item.buttonText)
    .sort((a, b) => a.sort - b.sort);
}

function legacyRichContentBlocks(component: CmsComponent): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const imageUrl = stringConfig(component, "imageUrl");
  const title = stringConfig(component, "title");
  const subtitle = stringConfig(component, "subtitle");
  const html = stringConfig(component, "html");
  const content = stringConfig(component, "content") || stringConfig(component, "text");
  const buttonText = stringConfig(component, "buttonText");

  if (imageUrl) blocks.push({ type: "image", imageUrl, caption: subtitle });
  for (const url of imageUrlsFromHtml(html).filter((url) => url !== imageUrl)) {
    blocks.push({ type: "image", imageUrl: url });
  }
  if (title) blocks.push({ type: "heading", title });
  if (subtitle && !imageUrl) blocks.push({ type: "paragraph", text: subtitle });
  for (const paragraph of htmlToPlainText(html || content).split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)) {
    blocks.push({ type: "paragraph", text: paragraph });
  }
  if (buttonText) {
    blocks.push({
      type: "button",
      buttonText,
      actionTargetType: stringConfig(component, "actionTargetType") || "none",
      targetPageKey: stringConfig(component, "targetPageKey"),
      targetConferenceId: stringConfig(component, "targetConferenceId"),
      targetProductId: stringConfig(component, "targetProductId"),
      targetProductCategoryId: stringConfig(component, "targetProductCategoryId"),
      targetCouponCampaignId: stringConfig(component, "targetCouponCampaignId"),
      externalUrl: stringConfig(component, "externalUrl"),
      phone: stringConfig(component, "phone"),
      copyText: stringConfig(component, "copyText")
    });
  }
  return blocks.length > 0 ? blocks : [{ type: "paragraph", text: "请在后台填写图文内容。" }];
}

function normalizeRichContentBlock(value: unknown, index: number): RichContentBlockItem {
  const record = isRecord(value) ? value : { type: "paragraph", text: String(value || "") };
  const typeValue = firstString(record, ["type"]);
  const type = ["heading", "paragraph", "image", "quote", "divider", "button"].includes(typeValue)
    ? (typeValue as RichContentBlockItem["type"])
    : "paragraph";
  const actionType = firstString(record, ["actionTargetType", "targetType", "actionType"]) || (type === "button" ? "page" : "none");
  return {
    id: firstString(record, ["id"]) || `rich-${index}`,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    sort: Number.isFinite(Number(record.sort)) ? Number(record.sort) : index * 10 + 10,
    type,
    title: firstString(record, ["title", "heading", "text"]),
    text: firstString(record, ["text", "content", "description"]),
    imageUrl: firstString(record, ["imageUrl", "url", "src"]),
    caption: firstString(record, ["caption", "alt"]),
    imageMode: firstString(record, ["imageMode"]) || "widthFix",
    align: firstString(record, ["align"]) || "left",
    buttonText: firstString(record, ["buttonText", "label"]) || (type === "button" ? "查看详情" : ""),
    actionTargetType: actionType,
    targetPageKey: firstString(record, ["targetPageKey", "pageKey"]),
    targetConferenceId: firstString(record, ["targetConferenceId", "conferenceId"]),
    targetProductId: firstString(record, ["targetProductId", "productId"]),
    targetProductCategoryId: firstString(record, ["targetProductCategoryId", "productCategoryId"]),
    targetCouponCampaignId: firstString(record, ["targetCouponCampaignId", "couponCampaignId"]),
    externalUrl: firstString(record, ["externalUrl", "url"]),
    externalMiniappAppId: firstString(record, ["externalMiniappAppId", "miniappAppId"]),
    externalMiniappPath: firstString(record, ["externalMiniappPath", "miniappPath"]),
    phone: firstString(record, ["phone"]),
    copyText: firstString(record, ["copyText"])
  };
}

async function handleEntryAction(component: CmsComponent, entry: HomeEntryItem): Promise<void> {
  await runAction(actionFromEntry(component, entry));
}

function actionFromEntry(component: CmsComponent, entry: HomeEntryItem): CmsActionConfig {
  const type = entry.targetType || stringConfig(component, "actionTargetType") || "none";
  const targetValue = entry.targetValue;
  return {
    type,
    pageKey: entry.pageKey || (type === "page" ? targetValue : ""),
    conferenceId: entry.conferenceId || (type === "conference" || type === "registration" ? targetValue : ""),
    productId: entry.productId || (type === "product" ? targetValue : ""),
    productCategoryId: entry.productCategoryId || (type === "product-category" ? targetValue : ""),
    couponCampaignId: entry.couponCampaignId || (type === "coupon" ? targetValue : ""),
    externalUrl: entry.externalUrl || (type === "external-h5" ? targetValue : ""),
    miniappAppId: entry.miniappAppId || (type === "external-miniapp" ? targetValue : ""),
    miniappPath: entry.miniappPath,
    miniappExtraData: entry.miniappExtraData,
    phone: entry.phone || (type === "phone" ? targetValue : ""),
    copyText: entry.copyText || (type === "copy" ? targetValue : "")
  };
}

async function runRichBlockAction(component: CmsComponent, block: RichContentBlockItem): Promise<void> {
  await runAction(actionFromRichBlock(component, block));
}

async function handleRichBlockAction(component: CmsComponent, block: RichContentBlockItem): Promise<void> {
  if (!richBlockHasAction(block)) return;
  await runRichBlockAction(component, block);
}

function richBlockHasAction(block: RichContentBlockItem): boolean {
  return block.type !== "divider" && Boolean(block.actionTargetType && block.actionTargetType !== "none");
}

function actionFromRichBlock(component: CmsComponent, block: RichContentBlockItem): CmsActionConfig {
  const type = block.actionTargetType || stringConfig(component, "actionTargetType") || "none";
  return {
    type,
    pageKey: block.targetPageKey,
    conferenceId: block.targetConferenceId || ((type === "registration" || type === "conference" || type === "ai") ? props.conference?.id || "" : ""),
    productId: block.targetProductId,
    productCategoryId: block.targetProductCategoryId,
    couponCampaignId: block.targetCouponCampaignId,
    externalUrl: block.externalUrl,
    miniappAppId: block.externalMiniappAppId,
    miniappPath: block.externalMiniappPath,
    miniappExtraData: "",
    phone: block.phone,
    copyText: block.copyText
  };
}

function loginCardAvatar(component: CmsComponent): string {
  if (storedUser.value?.wechatAvatarUrl) return storedUser.value.wechatAvatarUrl;
  return stringConfig(component, "logoUrl") || stringConfig(component, "imageUrl");
}

function loginCardInitial(component: CmsComponent): string {
  return (stringConfig(component, "logoText") || stringConfig(component, "title") || "观").slice(0, 1);
}

function loginCardTitle(component: CmsComponent): string {
  if (!storedUser.value) {
    return stringConfig(component, "title") || "欢迎来到观潮会集";
  }
  const name = storedUser.value.wechatNickname || storedUser.value.nickname || "会员";
  return stringConfig(component, "loggedInTitle") || `欢迎回来，${name}`;
}

function loginCardSubtitle(component: CmsComponent): string {
  if (!storedUser.value) {
    return stringConfig(component, "subtitle") || "欢迎光临，请登录成为会员，查看会议排期与报名权益";
  }
  return stringConfig(component, "loggedInSubtitle") || "可查看会议排期、报名权益和会员资料。";
}

async function handleLoginCard(component: CmsComponent): Promise<void> {
  if (!storedUser.value) {
    await promptWechatLogin();
    return;
  }
  const action = readComponentAction(component);
  await runAction({ ...action, type: action.type === "register" ? "member" : action.type || "member" });
}

function promotionBarStyle(component: CmsComponent): Record<string, string> {
  const background = stringConfig(component, "backgroundColor") || stringConfig(component, "cardBackground");
  const height = numberConfig(component, "barHeight", 0) || numberConfig(component, "moduleHeight", 0);
  return {
    ...textStyle(component),
    ...(height > 0 ? { minHeight: `${height}rpx`, paddingTop: "0", paddingBottom: "0" } : {}),
    ...(background ? { background } : {})
  };
}

function dualTrackRows(component: CmsComponent): DualTrackRow[] {
  return [
    {
      title: stringConfig(component, "primaryTitle") || "五大增量生态",
      items: stringListConfig(component, "primaryItems").length > 0 ? stringListConfig(component, "primaryItems") : ["自然", "银发", "赛事", "研学", "情绪"],
      buttonText: stringConfig(component, "primaryButtonText")
    },
    {
      title: stringConfig(component, "secondaryTitle") || "五大垂类赛道",
      items: stringListConfig(component, "secondaryItems").length > 0 ? stringListConfig(component, "secondaryItems") : ["学前", "科创", "舞蹈", "美术", "自主学习"],
      buttonText: stringConfig(component, "secondaryButtonText")
    }
  ];
}

async function handleDualTrackAction(component: CmsComponent, rowIndex: number): Promise<void> {
  const action = rowIndex === 0 ? readComponentAction(component) : readComponentAction(component, "secondary");
  await runAction(action);
}

function readComponentAction(component: CmsComponent, prefix = ""): CmsActionConfig {
  const key = (name: string) => prefix ? `${prefix}${name.slice(0, 1).toUpperCase()}${name.slice(1)}` : name;
  return {
    type: stringConfig(component, key("actionTargetType")) || (prefix ? "none" : "register"),
    pageKey: stringConfig(component, key("targetPageKey")),
    conferenceId: stringConfig(component, key("targetConferenceId")),
    productId: stringConfig(component, key("targetProductId")),
    productCategoryId: stringConfig(component, key("targetProductCategoryId")),
    couponCampaignId: stringConfig(component, key("targetCouponCampaignId")) || stringConfig(component, "couponCampaignId") || stringConfig(component, "campaignId"),
    externalUrl: stringConfig(component, key("externalUrl")) || stringConfig(component, key("url")),
    miniappAppId: stringConfig(component, key("externalMiniappAppId")),
    miniappPath: stringConfig(component, key("externalMiniappPath")),
    miniappExtraData: stringConfig(component, key("externalMiniappExtraData")),
    phone: stringConfig(component, key("phone")),
    copyText: stringConfig(component, key("copyText"))
  };
}

function speakerItems(component: CmsComponent): SpeakerItem[] {
  return arrayConfig(component, "speakers").map((item) => {
    if (isRecord(item)) {
      const name = firstString(item, ["name", "title", "speakerName"]) || "嘉宾";
      return {
        name,
        role: firstString(item, ["role", "position", "subtitle", "company", "title"]) || "",
        bio: firstString(item, ["bio", "description", "text", "summary"]) || "",
        avatarUrl: firstString(item, ["avatarUrl", "avatar", "imageUrl", "photoUrl"]) || "",
        initial: name.slice(0, 1)
      };
    }

    const parts = splitConfigLine(String(item));
    const name = parts[0] || "嘉宾";
    return {
      name,
      role: parts[1] || "",
      bio: parts.slice(2).join(" "),
      avatarUrl: firstImageUrl(parts),
      initial: name.slice(0, 1)
    };
  });
}

function scheduleItems(component: CmsComponent): ScheduleItem[] {
  return arrayConfig(component, "items").map((item) => {
    if (isRecord(item)) {
      return {
        time: firstString(item, ["time", "startAt", "period"]) || "",
        title: firstString(item, ["title", "topic", "name", "text"]) || "日程安排",
        description: firstString(item, ["description", "desc", "speaker", "location"]) || ""
      };
    }

    const parts = splitConfigLine(String(item));
    return {
      time: parts[0] || "",
      title: parts[1] || parts[0] || "日程安排",
      description: parts.slice(2).join(" ")
    };
  });
}

function faqItems(component: CmsComponent): FaqItem[] {
  return arrayConfig(component, "items").map((item) => {
    if (isRecord(item)) {
      return {
        question: firstString(item, ["question", "title", "q"]) || "常见问题",
        answer: firstString(item, ["answer", "content", "text", "a"]) || ""
      };
    }

    const parts = splitConfigLine(String(item));
    return {
      question: parts[0] || "常见问题",
      answer: parts.slice(1).join(" ")
    };
  });
}

function sponsorItems(component: CmsComponent): SponsorItem[] {
  return arrayConfig(component, "sponsors").map((item) => {
    if (isRecord(item)) {
      return {
        name: firstString(item, ["name", "title"]) || "合作伙伴",
        logoUrl: firstString(item, ["logoUrl", "imageUrl", "logo"]) || "",
        url: firstString(item, ["url", "link", "linkUrl"]) || ""
      };
    }

    const parts = splitConfigLine(String(item));
    const image = firstImageUrl(parts);
    const url = parts.find((part) => /^https?:\/\//i.test(part) && part !== image) || "";
    return { name: parts[0] || "合作伙伴", logoUrl: image, url };
  });
}

function tagItems(component: CmsComponent): TagFilterItem[] {
  return arrayConfig(component, "items").map((item) => {
    if (isRecord(item)) {
      const label = firstString(item, ["label", "name", "title", "text"]) || "标签";
      return {
        label,
        value: firstString(item, ["value", "tag", "location", "category"]) || label,
        target: firstString(item, ["target", "type", "field"]) || stringConfig(component, "target") || "tag"
      };
    }
    const parts = splitConfigLine(String(item));
    return {
      label: parts[0] || "标签",
      value: parts[1] || parts[0] || "标签",
      target: parts[2] || stringConfig(component, "target") || "tag"
    };
  });
}

function downloadItems(component: CmsComponent): DownloadItem[] {
  return arrayConfig(component, "items").map((item) => {
    if (isRecord(item)) {
      return {
        name: firstString(item, ["name", "title", "label"]) || "资料",
        url: firstString(item, ["url", "fileUrl", "link"]) || "",
        description: firstString(item, ["description", "desc", "text"]) || ""
      };
    }
    const parts = splitConfigLine(String(item));
    return {
      name: parts[0] || "资料",
      url: parts.find((part) => /^https?:\/\//i.test(part)) || parts[1] || "",
      description: parts.slice(2).join(" ")
    };
  });
}

function testimonialItems(component: CmsComponent): TestimonialItem[] {
  return arrayConfig(component, "items").map((item) => {
    if (isRecord(item)) {
      return {
        content: firstString(item, ["content", "text", "comment", "quote"]) || "评价内容待补充",
        name: firstString(item, ["name", "author", "user"]) || "参会者",
        company: firstString(item, ["company", "organization", "org", "title"]) || "",
        avatarUrl: firstString(item, ["avatarUrl", "avatar", "imageUrl"]) || ""
      };
    }
    const parts = splitConfigLine(String(item));
    return {
      content: parts[0] || "评价内容待补充",
      name: parts[1] || "参会者",
      company: parts[2] || "",
      avatarUrl: firstImageUrl(parts)
    };
  });
}

function countdownParts(component: CmsComponent): CountdownPart[] | null {
  const target = parseTargetTime(stringConfig(component, "targetAt"));
  if (!target) return null;
  const remainingSeconds = Math.max(0, Math.floor((target - nowTimestamp.value) / 1000));
  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  return [
    { label: "天", value: String(days).padStart(2, "0") },
    { label: "时", value: String(hours).padStart(2, "0") },
    { label: "分", value: String(minutes).padStart(2, "0") },
    { label: "秒", value: String(seconds).padStart(2, "0") }
  ];
}

function countdownEnded(component: CmsComponent): boolean {
  const target = parseTargetTime(stringConfig(component, "targetAt"));
  return Boolean(target && target <= nowTimestamp.value);
}

function liveStatusText(component: CmsComponent): string {
  const start = parseTargetTime(stringConfig(component, "startAt") || stringConfig(component, "liveAt"));
  const end = parseTargetTime(stringConfig(component, "endAt"));
  if (start && start > nowTimestamp.value) return `未开始：${formatDateTime(new Date(start).toISOString())}`;
  if (end && end <= nowTimestamp.value) return stringConfig(component, "endedText") || "直播已结束，可查看回放或复制链接。";
  return stringConfig(component, "statusText") || "直播进行中或可预约观看。";
}

function safeHtml(component: CmsComponent): string {
  const html = stringConfig(component, "html");
  return html
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-z][a-z0-9-]*)(\s[^>]*)?>/gi, sanitizeHtmlTag);
}

function htmlToPlainText(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function imageUrlsFromHtml(value: string): string[] {
  const urls: string[] = [];
  value.replace(/<img\b[^>]*\bsrc\s*=\s*(['"])(.*?)\1[^>]*>/gi, (_match, _quote: string, src: string) => {
    const url = src.trim();
    if (/^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
    return "";
  });
  return urls;
}

function toggleFaq(component: CmsComponent, index: number): void {
  const key = `${component.id}:${index}`;
  faqOpenMap.value = { ...faqOpenMap.value, [key]: !faqOpenMap.value[key] };
}

function isFaqOpen(component: CmsComponent, index: number): boolean {
  const key = `${component.id}:${index}`;
  return faqOpenMap.value[key] ?? index === 0;
}

function callPhone(phone: string) {
  if (!phone) return;
  uni.makePhoneCall({
    phoneNumber: phone,
    fail: () => undefined
  });
}

function refreshStoredUser(): void {
  storedUser.value = getStoredUser();
}

function handleWechatProfileUpdated(): void {
  refreshStoredUser();
}

function goPath(path: string) {
  if (!path) return;
  uni.navigateTo({
    url: path,
    fail: () => {
      uni.switchTab({ url: path, fail: () => undefined });
    }
  });
}

async function goLoginPath(path: string): Promise<void> {
  try {
    await ensureLogin();
    refreshStoredUser();
    if (!storedUser.value?.wechatNickname || !storedUser.value?.wechatAvatarUrl) {
      setTimeout(() => uni.$emit("wechat-profile:open"), 120);
    }
    goPath(path);
  } catch (error) {
    uni.showToast({ title: readErrorText(error, "请先登录"), icon: "none" });
  }
}

async function promptWechatLogin(): Promise<void> {
  try {
    await ensureLogin();
    refreshStoredUser();
    uni.$emit("wechat-profile:open");
  } catch (error) {
    uni.showToast({ title: readErrorText(error, "登录失败，请稍后重试"), icon: "none" });
  }
}

async function runAction(action: CmsActionConfig): Promise<void> {
  const type = action.type || "none";
  if (type === "none") return;
  if (type === "login") {
    await promptWechatLogin();
    return;
  }
  if (type === "page") {
    if (!action.pageKey) return showTargetMissing("请选择目标页面");
    const path = pagePath(action.pageKey);
    if (pageNeedsLogin(action.pageKey, path)) {
      await goLoginPath(path);
    } else {
      goPath(path);
    }
    return;
  }
  if (type === "conference") {
    if (!action.conferenceId) return showTargetMissing("请选择目标会议");
    emit("openConference", action.conferenceId);
    return;
  }
  if (type === "register" || type === "registration") {
    const conferenceId = action.conferenceId || props.conference?.id || "";
    if (type === "registration" && conferenceId) {
      goPath(`/pages/registration/form?conferenceId=${encodeURIComponent(conferenceId)}`);
      return;
    }
    emit("register");
    return;
  }
  if (type === "product") {
    if (!action.productId) return showTargetMissing("请选择目标商品");
    goPath(`/pages/mall/detail?id=${encodeURIComponent(action.productId)}`);
    return;
  }
  if (type === "product-category") {
    const query = stringifyQuery({ categoryId: action.productCategoryId });
    goPath(`/pages/mall/index${query ? `?${query}` : ""}`);
    return;
  }
  if (type === "coupon") {
    if (!action.couponCampaignId) return showTargetMissing("请选择目标券活动");
    try {
      const campaign = await getCouponCampaignPublic(action.couponCampaignId);
      goPath(`/pages/coupon/claim?claimCode=${encodeURIComponent(campaign.claimCode)}`);
    } catch {
      showTargetMissing("券活动不可用或已下线");
    }
    return;
  }
  if (type === "member") {
    await goLoginPath("/pages/member/center");
    return;
  }
  if (type === "cart") {
    await goLoginPath("/pages/cart/index");
    return;
  }
  if (type === "mall-orders") {
    await goLoginPath("/pages/mall/orders");
    return;
  }
  if (type === "invoice") {
    await goLoginPath("/pages/invoice/index");
    return;
  }
  if (type === "aftersale") {
    await goLoginPath("/pages/mall/orders?tab=aftersale");
    return;
  }
  if (type === "ai") {
    const query = stringifyQuery({ conferenceId: action.conferenceId || props.conference?.id || undefined });
    goPath(`/pages/ai-assistant/index${query ? `?${query}` : ""}`);
    return;
  }
  if (type === "external-h5") {
    openOrCopyLink(action.externalUrl, "外部链接");
    return;
  }
  if (type === "external-miniapp") {
    openMiniapp(action);
    return;
  }
  if (type === "phone") {
    callPhone(action.phone);
    return;
  }
  if (type === "copy") {
    copyText(action.copyText, "内容已复制");
    return;
  }
  emit("register");
}

function pageNeedsLogin(pageKey: string, path: string): boolean {
  const protectedKeys = new Set(["my-registrations", "registration-success", "cart", "member-center", "mall-orders", "invoice"]);
  if (protectedKeys.has(pageKey)) return true;
  return ["/pages/registrations/my", "/pages/cart/index", "/pages/member/center", "/pages/mall/orders", "/pages/invoice/index"].some((item) => path.startsWith(item));
}

function openMiniapp(action: CmsActionConfig): void {
  if (!action.miniappAppId) {
    showTargetMissing("请配置外部小程序 AppID");
    return;
  }
  // #ifdef MP-WEIXIN
  uni.navigateToMiniProgram({
    appId: action.miniappAppId,
    path: action.miniappPath || undefined,
    extraData: parseJsonRecord(action.miniappExtraData),
    fail: () => copyText(`${action.miniappAppId}${action.miniappPath ? ` ${action.miniappPath}` : ""}`, "小程序信息已复制")
  });
  // #endif
  // #ifndef MP-WEIXIN
  copyText(`${action.miniappAppId}${action.miniappPath ? ` ${action.miniappPath}` : ""}`, "小程序信息已复制");
  // #endif
}

function parseJsonRecord(value: string): Record<string, unknown> | undefined {
  if (!value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function profileTargetPath(component: CmsComponent): string {
  const target = stringConfig(component, "target");
  if (target === "registrations") return "/pages/registrations/my";
  if (target === "member") return "/pages/member/center";
  return "/pages/member/center";
}

function searchValue(component: CmsComponent): string {
  return searchValues.value[component.id] ?? "";
}

function setSearchValue(component: CmsComponent, event: unknown): void {
  const value = readEventValue(event);
  searchValues.value = { ...searchValues.value, [component.id]: value };
}

function submitSearch(component: CmsComponent): void {
  const keyword = searchValue(component).trim();
  const query = stringifyQuery({
    keyword,
    tag: stringConfig(component, "tag"),
    location: stringConfig(component, "location"),
    category: stringConfig(component, "category"),
    scope: stringConfig(component, "searchScope") || undefined
  });
  goPath(`/pages/index/index${query ? `?${query}` : ""}`);
}

function submitTag(component: CmsComponent, item: TagFilterItem): void {
  const target = item.target || stringConfig(component, "target") || "tag";
  if (["product-category", "mall-category", "productKeyword"].includes(target) || stringConfig(component, "scope") === "mall") {
    const value = item.value === "all" ? "" : item.value;
    const query = stringifyQuery({
      categoryId: target === "product-category" || target === "mall-category" ? value : undefined,
      keyword: target === "productKeyword" ? value : undefined
    });
    goPath(`/pages/mall/index${query ? `?${query}` : ""}`);
    return;
  }
  const query = stringifyQuery({
    tag: target === "tag" ? item.value : undefined,
    location: target === "location" ? item.value : undefined,
    category: target === "category" ? item.value : undefined
  });
  goPath(`/pages/index/index${query ? `?${query}` : ""}`);
}

async function handleCouponCard(component: CmsComponent): Promise<void> {
  const directClaimCode = stringConfig(component, "claimCode");
  const campaignId = stringConfig(component, "couponCampaignId") || stringConfig(component, "campaignId");
  try {
    let claimCode = directClaimCode;
    if (!claimCode && campaignId) {
      const campaign = await getCouponCampaignPublic(campaignId);
      claimCode = campaign.claimCode;
      couponStatusMap.value = { ...couponStatusMap.value, [component.id]: campaign.statusText };
    }
    if (!claimCode) {
      await goLoginPath("/pages/coupon/my");
      return;
    }
    await claimCoupon(claimCode);
    refreshStoredUser();
    couponStatusMap.value = { ...couponStatusMap.value, [component.id]: "领取成功，可在我的优惠券中查看。" };
    uni.showToast({ title: "领取成功", icon: "success" });
  } catch (error) {
    const message = readErrorText(error, "领取失败，请稍后再试");
    couponStatusMap.value = { ...couponStatusMap.value, [component.id]: message };
    uni.showToast({ title: message, icon: "none" });
  }
}

function couponStatus(component: CmsComponent): string {
  return couponStatusMap.value[component.id] ?? "";
}

function showRegistrationOrders(component: CmsComponent): boolean {
  const type = stringConfig(component, "orderType") || "both";
  return type === "both" || type === "registration";
}

function showMallOrders(component: CmsComponent): boolean {
  const type = stringConfig(component, "orderType") || "both";
  return type === "both" || type === "mall";
}

function mallProducts(component: CmsComponent): Product[] {
  return mallProductMap.value[component.id] ?? [];
}

async function addMallProductToCart(item: Product, component: CmsComponent): Promise<void> {
  const sku = item.skus.find((entry) => entry.availableStock > 0) ?? item.skus[0];
  if (!sku) {
    uni.showToast({ title: "该商品暂无可售规格", icon: "none" });
    return;
  }
  try {
    await addProductCartItem(sku.id, 1);
    uni.showToast({ title: stringConfig(component, "cartSuccessText") || "已加入购物车", icon: "success" });
  } catch (err) {
    uni.showToast({ title: readErrorText(err, "加入购物车失败"), icon: "none" });
  }
}

function mallListPath(component: CmsComponent): string {
  const query = stringifyQuery({
    keyword: stringConfig(component, "keyword"),
    categoryId: stringConfig(component, "productCategoryId") || stringConfig(component, "categoryId")
  });
  return `/pages/mall/index${query ? `?${query}` : ""}`;
}

async function loadMallProductComponents(): Promise<void> {
  const targets = visibleComponents.value.filter((item) => item.type === "mall-product-grid");
  await Promise.all(
    targets.map(async (component) => {
      mallProductLoading.value = { ...mallProductLoading.value, [component.id]: true };
      try {
        const response = await getProducts({
          page: 1,
          pageSize: Math.min(Math.max(numberConfig(component, "limit", 4), 1), 20),
          keyword: stringConfig(component, "keyword"),
          categoryId: stringConfig(component, "productCategoryId") || stringConfig(component, "categoryId")
        });
        mallProductMap.value = { ...mallProductMap.value, [component.id]: response.items };
      } catch {
        mallProductMap.value = { ...mallProductMap.value, [component.id]: [] };
      } finally {
        mallProductLoading.value = { ...mallProductLoading.value, [component.id]: false };
      }
    })
  );
}

function mallProductPriceText(item: Product): string {
  const prices = item.skus.map((sku) => sku.priceCent);
  if (prices.length === 0) return "暂无价格";
  return `¥${formatCent(Math.min(...prices))} 起`;
}

function copyText(value: string, title = "已复制"): void {
  if (!value) {
    uni.showToast({ title: "内容未配置", icon: "none" });
    return;
  }
  uni.setClipboardData({
    data: value,
    success: () => uni.showToast({ title, icon: "none" }),
    fail: () => uni.showToast({ title: "复制失败", icon: "none" })
  });
}

function openOrCopyLink(url: string, title = "链接"): void {
  if (!url) {
    uni.showToast({ title: `${title}未配置`, icon: "none" });
    return;
  }
  // #ifdef H5
  window.open(url, "_blank", "noopener,noreferrer");
  // #endif
  // #ifndef H5
  copyText(url, "链接已复制");
  // #endif
}

function fallbackList(component: CmsComponent, fallback: string[]): string[] {
  const items = stringListConfig(component, "items");
  return items.length > 0 ? items : fallback;
}

function limitedConferences(component: CmsComponent): ConferenceListItem[] {
  return conferences.value.slice(0, Math.max(1, numberConfig(component, "limit", 10)));
}

function scheduleMonths(component: CmsComponent): Array<{ key: string; year: string; label: string }> {
  const months = new Map<string, { key: string; year: string; label: string; timestamp: number }>();
  conferences.value.forEach((item) => {
    const date = parseDate(item.startsAt);
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) {
      months.set(key, {
        key,
        year: String(date.getFullYear()),
        label: `${date.getMonth() + 1} 月`,
        timestamp: date.getTime()
      });
    }
  });
  const result = Array.from(months.values()).sort((a, b) => a.timestamp - b.timestamp);
  if (result.length > 0) return result;
  const today = new Date();
  return Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() + index, 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      year: String(date.getFullYear()),
      label: `${date.getMonth() + 1} 月`
    };
  });
}

function activeScheduleMonth(component: CmsComponent): string {
  return scheduleMonthMap.value[component.id] || scheduleMonths(component)[0]?.key || "";
}

function setScheduleMonth(component: CmsComponent, monthKey: string): void {
  scheduleMonthMap.value = { ...scheduleMonthMap.value, [component.id]: monthKey };
}

function scheduleCategories(component: CmsComponent): string[] {
  const configured = stringListConfig(component, "categories");
  if (configured.length > 0) return configured.includes("全部") ? configured : ["全部", ...configured];
  const fromTabs = stringListConfig(component, "tabs");
  if (fromTabs.length > 0) return fromTabs.includes("全部") ? fromTabs : ["全部", ...fromTabs];
  return ["全部", "闭门会", "论坛", "沙龙", "参访", "私董会"];
}

function activeScheduleCategory(component: CmsComponent): string {
  return scheduleCategoryMap.value[component.id] || scheduleCategories(component)[0] || "全部";
}

function setScheduleCategory(component: CmsComponent, category: string): void {
  scheduleCategoryMap.value = { ...scheduleCategoryMap.value, [component.id]: category };
}

function scheduleConferences(component: CmsComponent): ConferenceListItem[] {
  const monthKey = activeScheduleMonth(component);
  const category = activeScheduleCategory(component);
  const limit = Math.max(1, numberConfig(component, "limit", 8));
  return conferences.value
    .filter((item) => {
      const date = parseDate(item.startsAt);
      if (!date) return false;
      const itemMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthMatched = !monthKey || itemMonth === monthKey;
      const categoryMatched = !category || category === "全部" || [item.title, item.summary, item.location].some((value) => value?.includes(category));
      return monthMatched && categoryMatched;
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, limit);
}

function scheduleCardTag(item: ConferenceListItem, component: CmsComponent): string {
  const categories = scheduleCategories(component).filter((item) => item !== "全部");
  return categories.find((category) => [item.title, item.summary, item.location].some((value) => value?.includes(category))) || categories[0] || "会议";
}

function scheduleDay(value: string): string {
  const date = parseDate(value);
  return date ? `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}` : "待定";
}

function scheduleWeekday(value: string): string {
  const date = parseDate(value);
  if (!date) return "";
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
}

function scheduleTime(value: string): string {
  const date = parseDate(value);
  if (!date) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function scheduleTimeRange(startsAt: string, endsAt?: string | null): string {
  const start = scheduleTime(startsAt);
  const end = endsAt ? scheduleTime(endsAt) : "";
  if (!start) return "";
  if (!end || end === start) return start;
  return `${start}-${end}`;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addFirstScheduleToCalendar(component: CmsComponent): void {
  const item = scheduleConferences(component)[0] || conferences.value[0];
  if (!item) {
    uni.showToast({ title: "暂无可添加的会议", icon: "none" });
    return;
  }
  addConferenceToCalendar(item);
}

function addConferenceToCalendar(item: ConferenceListItem): void {
  const start = parseDate(item.startsAt);
  if (!start) {
    uni.showToast({ title: "会议时间未配置", icon: "none" });
    return;
  }
  const end = parseDate(item.endsAt) || new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const addPhoneCalendar = (uni as unknown as {
    addPhoneCalendar?: (options: Record<string, unknown>) => void;
  }).addPhoneCalendar;
  if (typeof addPhoneCalendar === "function") {
    addPhoneCalendar({
      title: item.title,
      startTime: Math.floor(start.getTime() / 1000),
      endTime: Math.floor(end.getTime() / 1000),
      location: item.location || "",
      notes: item.summary || "观潮会集会议",
      success: () => uni.showToast({ title: "已添加到日历", icon: "none" }),
      fail: () => uni.showToast({ title: "添加失败，请检查权限", icon: "none" })
    });
    return;
  }
  copyText(`${item.title} ${formatDateTime(item.startsAt)} ${item.location || ""}`, "会议日程已复制");
}

function showConferenceCover(component: CmsComponent, item: ConferenceListItem): boolean {
  return Boolean(booleanConfig(component, "showCover", true) && conferenceCoverUrl(item) && !failedConferenceCoverIds.value.has(item.id));
}

function conferenceCoverUrl(item: ConferenceListItem): string {
  return item.coverImageUrl?.trim() || "";
}

function conferenceCoverInitial(item: ConferenceListItem): string {
  return item.title.slice(0, 1) || "会";
}

function markConferenceCoverFailed(id: string): void {
  if (failedConferenceCoverIds.value.has(id)) {
    return;
  }
  failedConferenceCoverIds.value = new Set([...failedConferenceCoverIds.value, id]);
}

function conferenceTabItems(component: CmsComponent): TagFilterItem[] {
  const configured = arrayConfig(component, "tabs").map(String).filter(Boolean);
  const labels = configured.length > 0
    ? configured
    : ["全部", ...Array.from(new Set(conferences.value.map((item) => item.location || "其他会议").filter(Boolean))).slice(0, 4)];
  const target = stringConfig(component, "target") || stringConfig(component, "tabTarget") || "tag";
  return labels.map((label) => ({
    label,
    value: label === "全部" ? "" : label,
    target
  }));
}

function summaryFallback(component: CmsComponent): string {
  return stringConfig(component, "summaryFallback") || "点击查看会议详情和报名信息。";
}

function detailButtonText(component: CmsComponent): string {
  return stringConfig(component, "detailButtonText") || "查看详情";
}

function conferenceActionText(item: ConferenceListItem, component: CmsComponent): string {
  if (isConferenceEnded(item)) return stringConfig(component, "endedButtonText") || "查看详情";
  if (!shouldShowAppointmentAction(item, component)) return detailButtonText(component);
  return stringConfig(component, "appointmentButtonText") || "提前预约";
}

function conferenceStatusText(item: ConferenceListItem, component: CmsComponent): string {
  if (isConferenceEnded(item)) return stringConfig(component, "endedStatusText") || "已结束";
  return shouldShowAppointmentAction(item, component) ? "即将开始" : "开放报名";
}

function shouldShowAppointmentAction(item: ConferenceListItem, component: CmsComponent): boolean {
  if (!booleanConfig(component, "showAppointmentButton", true)) return false;
  if (isConferenceEnded(item)) return false;
  const startAt = Date.parse(item.registrationStartsAt || item.startsAt || "");
  return Number.isFinite(startAt) && nowTimestamp.value < startAt;
}

function isConferenceEnded(item: ConferenceListItem): boolean {
  const endAt = Date.parse(item.registrationEndsAt || item.endsAt || "");
  return Number.isFinite(endAt) && nowTimestamp.value > endAt;
}

async function handleConferenceAction(item: ConferenceListItem, component: CmsComponent): Promise<void> {
  if (!shouldShowAppointmentAction(item, component)) {
    emit("openConference", item.id);
    return;
  }

  try {
    await ensureLogin();
    refreshStoredUser();
    if (!storedUser.value?.wechatNickname || !storedUser.value?.wechatAvatarUrl) {
      setTimeout(() => uni.$emit("wechat-profile:open"), 120);
    }
    const result = await reserveConferenceAppointment(item.id);
    uni.showToast({ title: result.message || "预约成功", icon: "none" });
  } catch (error) {
    uni.showToast({ title: readErrorText(error, "预约失败，请稍后重试"), icon: "none" });
  }
}

function heroKicker(component: CmsComponent): string {
  return stringConfig(component, "kicker") || stringConfig(component, "eyebrow") || "会议报名";
}

function heroTitle(component: CmsComponent): string {
  return stringConfig(component, "title") || props.conference?.title || "选择会议，完成报名缴费";
}

function heroDescription(component: CmsComponent): string {
  return stringConfig(component, "description") || stringConfig(component, "subtitle") || props.conference?.summary || "查看会议安排、选择报名规格，支付成功后自动生成参会记录。";
}

function heroMetaLines(component: CmsComponent): string[] {
  const configured = arrayConfig(component, "meta").map(String).filter(Boolean);
  if (configured.length > 0) return configured.slice(0, 3);
  if (!props.conference) return [];
  return [
    props.conference.startsAt ? `时间 ${formatDateTime(props.conference.startsAt)}` : "",
    props.conference.location ? `地点 ${props.conference.location}` : ""
  ].filter(Boolean);
}

function heroClass(component: CmsComponent): string[] {
  return [
    "cms-hero",
    booleanConfig(component, "fullBleed", true) ? "is-full-bleed" : "",
    booleanConfig(component, "imageOnly", false) ? "is-image-only" : ""
  ].filter(Boolean);
}

function heroStyle(component: CmsComponent): Record<string, string> {
  const height = Math.max(260, numberConfig(component, "height", 430));
  return {
    "--cms-hero-height": `${height}rpx`
  };
}

function heroImageMode(component: CmsComponent): string {
  return imageCoverMode(component, "imageMode");
}

function showHeroContent(component: CmsComponent): boolean {
  if (booleanConfig(component, "imageOnly", false)) return false;
  return booleanConfig(component, "showContent", true);
}

function showHeroShade(component: CmsComponent): boolean {
  return showHeroContent(component) && booleanConfig(component, "showOverlay", true);
}

function carouselClass(component: CmsComponent): string[] {
  return ["cms-carousel", booleanConfig(component, "fullBleed", true) ? "is-full-bleed" : ""].filter(Boolean);
}

function carouselStyle(component: CmsComponent): Record<string, string> {
  const height = Math.max(160, numberConfig(component, "height", 320));
  return {
    "--cms-carousel-height": `${height}rpx`
  };
}

function carouselImageMode(component: CmsComponent): string {
  return imageCoverMode(component, "imageMode");
}

function homeHeroStyle(component: CmsComponent): Record<string, string> {
  const height = Math.max(260, intConfig(component, "height", 420));
  const radius = Math.max(0, intConfig(component, "radius", radiusPresetRpx(component)));
  return {
    minHeight: `${height}rpx`,
    borderRadius: `${radius}rpx`,
    background: stringConfig(component, "backgroundColor") || "var(--cms-gradient-hero)"
  };
}

function homeHeroImageMode(component: CmsComponent): string {
  return imageCoverMode(component, "imageMode");
}

function showHomeHeroCopy(component: CmsComponent): boolean {
  if (booleanConfig(component, "imageOnly", false)) return false;
  return Boolean(
    stringConfig(component, "title") ||
      stringConfig(component, "subtitle") ||
      stringConfig(component, "description") ||
      stringConfig(component, "buttonText") ||
      stringConfig(component, "secondaryButtonText")
  );
}

function showHomeHeroShade(component: CmsComponent): boolean {
  return showHomeHeroCopy(component) && booleanConfig(component, "showOverlay", true);
}

function homeTitleStyle(component: CmsComponent): Record<string, string> {
  return {
    ...titleStyle(component),
    ...(stringConfig(component, "textColor") ? { color: stringConfig(component, "textColor") } : {})
  };
}

function homeTextStyle(component: CmsComponent): Record<string, string> {
  return {
    ...textStyle(component),
    ...(stringConfig(component, "textColor") ? { color: stringConfig(component, "textColor") } : {})
  };
}

function homePanelStyle(component: CmsComponent): Record<string, string> {
  if (isComponentTransparent(component)) {
    return {
      background: "transparent",
      border: "0",
      boxShadow: "none"
    };
  }
  const background = stringConfig(component, "backgroundColor") || stringConfig(component, "cardBackground");
  return {
    ...(background ? { background } : {}),
    borderRadius: `${radiusPresetRpx(component)}rpx`
  };
}

function homeGridStyle(component: CmsComponent): Record<string, string> {
  const columns = Math.min(4, Math.max(2, intConfig(component, "columns", moduleTokens(component)?.columns ?? (component.type === "service-shortcut-card" ? 2 : 3))));
  const gap = Math.max(4, intConfig(component, "cardGap", spacingPresetRpx(component)));
  if (entryLayoutMode(component) === "scroll") {
    return {
      gap: `${gap}rpx`
    };
  }
  return {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: `${gap}rpx`
  };
}

function entryLayoutMode(component: CmsComponent): "grid" | "scroll" {
  return stringConfig(component, "layoutMode") === "scroll" ? "scroll" : "grid";
}

function homeEntryClass(component: CmsComponent, entry: HomeEntryItem): string[] {
  const style = entry.cardStyle || stringConfig(component, "cardStyle") || moduleTokens(component)?.cardStyle || (entryTilesUseTransparentBackground(component) ? "plain" : "soft");
  return ["cms-entry-tile", `is-${style}`];
}

function homeEntryStyle(component: CmsComponent, entry: HomeEntryItem): Record<string, string> {
  const radius = Math.max(0, intConfig(component, "cardRadius", radiusPresetRpx(component)));
  const background = entry.backgroundColor || stringConfig(component, "cardBackground");
  return {
    ...(background ? { background } : entryTilesUseTransparentBackground(component) ? { background: "transparent", borderColor: "transparent", boxShadow: "none" } : {}),
    ...(entry.textColor ? { color: entry.textColor } : {}),
    borderRadius: `${radius}rpx`
  };
}

function entryIconClass(component: CmsComponent): string[] {
  const size = stringConfig(component, "iconSize") || moduleTokens(component)?.iconSize || "large";
  return [size === "small" ? "is-small" : size === "xlarge" ? "is-xlarge" : "is-large"];
}

function moduleContract(component: CmsComponent): ModuleRenderContract | null {
  return getModuleRenderContractForVisualComponent(component.type, visualPlatform.value);
}

function moduleTokens(component: CmsComponent) {
  return moduleContract(component)?.designTokens;
}

function radiusPresetRpx(component: CmsComponent): number {
  const preset = stringConfig(component, "radiusPreset") || moduleTokens(component)?.radiusPreset || "md";
  if (preset === "sm") return 16;
  if (preset === "lg") return 32;
  return 24;
}

function spacingPresetRpx(component: CmsComponent): number {
  const preset = stringConfig(component, "spacingPreset") || moduleTokens(component)?.spacingPreset || "standard";
  if (preset === "compact") return 10;
  if (preset === "relaxed") return 24;
  return 14;
}

function homeEntryTitleStyle(entry: HomeEntryItem): Record<string, string> {
  return entry.textColor ? { color: entry.textColor } : {};
}

function homeEntrySubtitleStyle(entry: HomeEntryItem): Record<string, string> {
  return entry.textColor ? { color: entry.textColor, opacity: "0.72" } : {};
}

function builtinIconLabel(entry: HomeEntryItem): string {
  const map: Record<string, string> = {
    conference: "会",
    registration: "报",
    order: "单",
    shop: "商",
    member: "员",
    invoice: "票",
    service: "客"
  };
  return map[entry.builtinIcon] || entry.title.slice(0, 1) || "入";
}

function moduleTitleVisible(component: CmsComponent): boolean {
  return booleanConfig(component, "showTitle", true);
}

function moduleSubtitle(component: CmsComponent): string {
  return stringConfig(component, "subtitle");
}

function moduleHeadStyle(component: CmsComponent): Record<string, string> {
  const align = stringConfig(component, "titleTextAlign") || stringConfig(component, "textAlign") || "left";
  return {
    textAlign: align,
    marginBottom: `${Math.max(0, intConfig(component, "titleBottomGap", 18))}rpx`
  };
}

function subtitleStyle(component: CmsComponent): Record<string, string> {
  const color = stringConfig(component, "subtitleTextColor");
  const size = numberConfig(component, "subtitleFontSize", 0);
  const align = stringConfig(component, "titleTextAlign") || stringConfig(component, "textAlign");
  return {
    ...(color ? { color } : {}),
    ...(size > 0 ? { fontSize: `${size}rpx` } : {}),
    ...(align ? { textAlign: align } : {})
  };
}

async function handleMoreAction(component: CmsComponent) {
  await runAction({
    type: stringConfig(component, "moreActionTargetType") || "none",
    pageKey: stringConfig(component, "moreTargetPageKey"),
    conferenceId: stringConfig(component, "moreTargetConferenceId"),
    productId: stringConfig(component, "moreTargetProductId"),
    productCategoryId: stringConfig(component, "moreTargetProductCategoryId"),
    couponCampaignId: stringConfig(component, "moreTargetCouponCampaignId"),
    externalUrl: stringConfig(component, "moreExternalUrl"),
    miniappAppId: stringConfig(component, "moreExternalMiniappAppId"),
    miniappPath: stringConfig(component, "moreExternalMiniappPath"),
    miniappExtraData: stringConfig(component, "moreExternalMiniappExtraData"),
    phone: stringConfig(component, "morePhone"),
    copyText: stringConfig(component, "moreCopyText")
  });
}

function conferenceImageMode(component: CmsComponent): string {
  return imageCoverMode(component, "cardImageMode");
}

function imageCoverMode(component: CmsComponent, key: string): string {
  const mode = stringConfig(component, key);
  if (mode === "contain") return "aspectFit";
  if (mode === "widthFix") return "widthFix";
  if (mode === "aspectFill") return "aspectFill";
  return "scaleToFill";
}

function textStyle(component: CmsComponent): Record<string, string> {
  const fontSize = numberConfig(component, "fontSize", 0);
  const fontFamily = stringConfig(component, "fontFamily");
  const textAlign = stringConfig(component, "textAlign");
  const textColor = stringConfig(component, "textColor");
  return {
    ...(fontSize > 0 ? { fontSize: `${fontSize}rpx` } : {}),
    ...(textColor ? { color: textColor } : {}),
    ...(textAlign ? { textAlign } : {}),
    ...(fontFamily ? { fontFamily: fontFamilyValue(fontFamily, component, "fontAssetUrl") } : {}),
    ...(fontFamily === "bold-sans" ? { fontWeight: "800" } : {})
  };
}

function richBlockClass(block: RichContentBlockItem): string[] {
  return ["cms-rich-content__block", `is-${block.type}`, richBlockHasAction(block) ? "is-clickable" : ""];
}

function richBlockStyle(_component: CmsComponent, block: RichContentBlockItem): Record<string, string> {
  return block.align ? { textAlign: block.align } : {};
}

function richContentClass(component: CmsComponent): string[] {
  return [
    "cms-section",
    "cms-rich-content",
    richContentContainerStyle(component) === "card" ? "is-card" : "is-transparent",
    richContentImageOnly(component) ? "is-image-stack" : ""
  ].filter(Boolean);
}

function richContentStyle(component: CmsComponent): Record<string, string> {
  const card = richContentContainerStyle(component) === "card";
  const gap = Math.max(0, intConfig(component, "blockGap", richContentImageOnly(component) ? 0 : 18));
  const padding = Math.max(0, intConfig(component, "contentPadding", 0));
  return {
    gap: `${gap}rpx`,
    padding: `${padding}rpx`,
    ...(card
      ? {}
      : {
          background: "transparent",
          border: "0",
          boxShadow: "none"
        })
  };
}

function richContentContainerStyle(component: CmsComponent): string {
  return componentContainerStyle(component);
}

function richContentImageOnly(component: CmsComponent): boolean {
  const blocks = richContentBlocks(component).filter((block) => block.enabled !== false && block.type !== "divider");
  return blocks.length > 0 && blocks.every((block) => block.type === "image");
}

function richBlockImageStyle(component: CmsComponent): Record<string, string> {
  const radius = Math.max(0, intConfig(component, "imageRadius", richContentImageOnly(component) ? 0 : 18));
  return {
    borderRadius: `${radius}rpx`
  };
}

function richBlockHeadingStyle(component: CmsComponent, block: RichContentBlockItem): Record<string, string> {
  return {
    ...titleStyle(component),
    ...(block.align ? { textAlign: block.align } : {})
  };
}

function richBlockTextStyle(component: CmsComponent, block: RichContentBlockItem): Record<string, string> {
  return {
    ...textStyle(component),
    ...(block.align ? { textAlign: block.align } : {})
  };
}

function richBlockImageMode(block: RichContentBlockItem): string {
  if (block.imageMode === "aspectFill") return "aspectFill";
  if (block.imageMode === "aspectFit") return "aspectFit";
  return "widthFix";
}

function titleStyle(component: CmsComponent): Record<string, string> {
  const fontSize = numberConfig(component, "titleFontSize", 0);
  const fontFamily = stringConfig(component, "titleFontFamily") || stringConfig(component, "fontFamily");
  const textAlign = stringConfig(component, "titleTextAlign") || stringConfig(component, "textAlign");
  const textColor = stringConfig(component, "titleTextColor") || stringConfig(component, "textColor");
  const customFontKey = stringConfig(component, "titleFontAssetUrl") ? "titleFontAssetUrl" : "fontAssetUrl";
  return {
    ...(booleanConfig(component, "showTitle", true) ? {} : { display: "none" }),
    ...(fontSize > 0 ? { fontSize: `${fontSize}rpx` } : {}),
    ...(textColor ? { color: textColor } : {}),
    ...(textAlign ? { textAlign } : {}),
    ...(fontFamily ? { fontFamily: fontFamilyValue(fontFamily, component, customFontKey) } : {}),
    fontWeight: stringConfig(component, "titleFontWeight") || (fontFamily === "bold-sans" ? "800" : "800")
  };
}

function conferenceTextStyle(component: CmsComponent, part: "title" | "summary" | "meta"): Record<string, string> {
  const prefix = part === "title" ? "cardTitle" : part === "summary" ? "cardSummary" : "cardMeta";
  const fallbackSize = part === "title" ? 28 : part === "summary" ? 22 : 21;
  return {
    fontSize: `${numberConfig(component, `${prefix}FontSize`, fallbackSize)}rpx`,
    color: stringConfig(component, `${prefix}Color`) || (part === "title" ? "#172033" : "#637083"),
    textAlign: stringConfig(component, `${prefix}Align`) || "left",
    fontFamily: fontFamilyValue(stringConfig(component, "fontFamily"), component, "fontAssetUrl"),
    ...(part === "title" ? { fontWeight: "800" } : {})
  };
}

function conferenceCardClass(component: CmsComponent, baseClass: string): string[] {
  return [baseClass, "is-conference-card", stringConfig(component, "cardImageLayout") === "full" ? "is-cover-full" : ""].filter(Boolean);
}

function conferenceImageClass(component: CmsComponent, baseClass: string): string[] {
  return [baseClass, stringConfig(component, "cardImageLayout") === "full" ? "is-cover-full__image" : ""].filter(Boolean);
}

function conferenceCardStyle(component: CmsComponent): Record<string, string> {
  return {
    marginTop: `${numberConfig(component, "cardMarginTop", 22)}rpx`,
    marginBottom: `${numberConfig(component, "cardMarginBottom", 0)}rpx`,
    marginLeft: `${numberConfig(component, "cardMarginX", 0)}rpx`,
    marginRight: `${numberConfig(component, "cardMarginX", 0)}rpx`,
    padding: `${numberConfig(component, "cardPadding", 26)}rpx`,
    borderRadius: `${numberConfig(component, "cardRadius", 8)}px`,
    gap: `${numberConfig(component, "cardGap", 18)}rpx`
  };
}

function conferenceImageStyle(component: CmsComponent): Record<string, string> {
  const size = conferenceThumbSize(component);
  if (stringConfig(component, "cardImageLayout") !== "full") {
    return {
      width: `${size.width}rpx`,
      height: `${size.height}rpx`,
      flexBasis: `${size.width}rpx`
    };
  }
  return {
    height: `${numberConfig(component, "cardImageHeight", 240)}rpx`,
    borderRadius: `${numberConfig(component, "cardRadius", 8)}px`
  };
}

function carouselConferences(component: CmsComponent): ConferenceListItem[] {
  const ids = new Set(stringListConfig(component, "conferenceIds"));
  const category = stringConfig(component, "category").trim();
  const source = ids.size > 0 ? conferences.value.filter((item) => ids.has(item.id)) : conferences.value;
  const filtered = category
    ? source.filter((item) => [item.title, item.summary, item.location].some((value) => value?.includes(category)))
    : source;
  return filtered.slice(0, Math.max(1, intConfig(component, "limit", 6)));
}

function eventCardClass(component: CmsComponent): string[] {
  return ["cms-event-card", stringConfig(component, "cardSize") === "small" ? "is-small" : "is-large"];
}

function taskCurrent(component: CmsComponent): number {
  return Math.max(0, intConfig(component, "current", 0));
}

function taskTarget(component: CmsComponent): number {
  return Math.max(1, intConfig(component, "target", 8));
}

function taskPercent(component: CmsComponent): number {
  return Math.min(100, Math.round((taskCurrent(component) / taskTarget(component)) * 100));
}

function imagePromoStyle(component: CmsComponent): Record<string, string> {
  const radius = intConfig(component, "radius", 0);
  return radius > 0 ? { borderRadius: `${radius}rpx` } : {};
}

function conferenceThumbSize(component: CmsComponent): { width: number; height: number } {
  const titleSize = numberConfig(component, "cardTitleFontSize", 28);
  const configuredWidth = numberConfig(component, "cardThumbWidth", 0);
  const width = configuredWidth > 0 ? configuredWidth : Math.min(Math.max(Math.round(titleSize * 7), 180), 260);
  const configuredHeight = numberConfig(component, "cardThumbHeight", 0);
  return {
    width,
    height: configuredHeight > 0 ? configuredHeight : Math.round(width * 0.72)
  };
}

function fontFamilyValue(value: string, component?: CmsComponent, key?: string): string {
  if (value === "custom" && component && key && stringConfig(component, key)) return fontFamilyFor(component, key);
  if (value === "serif") return "Songti SC, SimSun, serif";
  if (value === "sans") return "PingFang SC, Microsoft YaHei, sans-serif";
  if (value === "bold-sans") return "Heiti SC, Microsoft YaHei, sans-serif";
  return "inherit";
}

function fontFamilyFor(component: CmsComponent, key: string): string {
  return `cms-font-${component.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${key}`;
}

function loadCustomFonts() {
  for (const component of props.components) {
    for (const key of ["fontAssetUrl", "titleFontAssetUrl"]) {
      const url = stringConfig(component, key);
      if (!url) continue;
      uni.loadFontFace({
        family: fontFamilyFor(component, key),
        source: `url("${url}")`,
        global: true,
        success: () => undefined,
        fail: () => undefined
      });
    }
  }
}

function conferenceMetaLines(item: ConferenceListItem, component: CmsComponent, index: number): string[] {
  const parts: string[] = [];
  if (booleanConfig(component, "showTime", true)) parts.push(`会议时间：${formatDateTime(item.startsAt)}`);
  if (booleanConfig(component, "showLocation", true) && item.location) parts.push(`会议地点：${item.location}`);
  if (booleanConfig(component, "showRegistrationCount", false)) parts.push(`${registrationCountFor(item, component, index)} 人已报名`);
  return parts;
}

function registrationCountFor(item: ConferenceListItem, component: CmsComponent, index: number): number {
  const actual = typeof item.registrationCount === "number" ? item.registrationCount : 0;
  const virtual = numberConfig(component, "virtualRegistrationBase", 0) + index * numberConfig(component, "virtualRegistrationStep", 0);
  const mode = stringConfig(component, "registrationCountMode") || "actual";
  if (mode === "virtual") return virtual;
  if (mode === "actual-plus-virtual") return actual + virtual;
  return actual;
}

function titleFor(type: string): string {
  const map: Record<string, string> = {
    "ticket-price-list": "报名票种",
    "process-steps": "报名流程",
    "download-list": "资料下载",
    "testimonial-list": "参会评价",
    "tag-filter": "热门主题",
    search: "搜索",
    "coupon-card": "优惠券",
    "membership-benefits": "会员权益",
    "user-profile-card": "我的资料",
    "my-order-list": "我的订单",
    "mall-product-grid": "商城商品",
    "hero-banner": "顶部主视觉",
    "login-card": "登录欢迎卡",
    "quick-icon-grid": "快捷入口",
    "member-promo-banner": "会员权益",
    "event-card-carousel": "精选会议",
    "service-shortcut-card": "服务中心",
    "task-progress-card": "任务进度",
    "image-promo-card": "活动推荐",
    "rich-content-block": "自定义图文",
    "promotion-bar": "运营引导条",
    "dual-track-tags": "双赛道标签条"
  };
  return map[type] ?? "内容";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function splitConfigLine(value: string): string[] {
  return value.split(/[\n|｜,，;；]+/).map((item) => item.trim()).filter(Boolean);
}

function splitEntryLine(value: string): string[] {
  return value.split(/[|｜]/).map((item) => item.trim());
}

function firstImageUrl(items: string[]): string {
  return items.find(looksLikeImageUrl) || "";
}

function looksLikeImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /\.(png|apng|jpe?g|webp|gif|svg)(\?|$)/i.test(value);
}

function sanitizeHtmlTag(match: string, tagName: string): string {
  const tag = tagName.toLowerCase();
  const allowedTags = new Set(["p", "br", "strong", "b", "em", "i", "u", "span", "div", "ul", "ol", "li", "a", "img", "h1", "h2", "h3", "h4", "blockquote"]);
  if (!allowedTags.has(tag)) return "";
  if (match.startsWith("</")) return `</${tag}>`;
  const safeAttrs = sanitizeHtmlAttributes(match, tag);
  return `<${tag}${safeAttrs}>`;
}

function sanitizeHtmlAttributes(match: string, tag: string): string {
  const attrSource = match.replace(/^<\s*\/?\s*[a-z][a-z0-9-]*/i, "").replace(/\/?\s*>$/i, "");
  const attrs: string[] = [];
  attrSource.replace(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(['"])(.*?)\2/g, (_raw, name: string, _quote: string, value: string) => {
    const attr = name.toLowerCase();
    const trimmed = value.trim();
    if (!isAllowedHtmlAttribute(tag, attr, trimmed)) return "";
    attrs.push(` ${attr}="${escapeHtmlAttribute(trimmed)}"`);
    return "";
  });
  return attrs.join("");
}

function isAllowedHtmlAttribute(tag: string, attr: string, value: string): boolean {
  if (attr.startsWith("on")) return false;
  if (/javascript\s*:/i.test(value)) return false;
  if (tag === "a") return ["href", "title"].includes(attr) && /^https?:\/\//i.test(value);
  if (tag === "img") return ["src", "alt", "title", "mode"].includes(attr) && (attr !== "src" || /^https?:\/\//i.test(value));
  return ["class", "style"].includes(attr) && !/url\s*\(/i.test(value);
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unsupportedComponentText(component: CmsComponent): string {
  const support = getCmsComponentSupport(normalizedComponentType(component));
  return `${support.label}未纳入当前 H5/小程序渲染支持矩阵，请联系主办方调整页面配置。`;
}

function normalizedComponentType(component: CmsComponent): string {
  return typeof component.type === "string" ? component.type.trim() : "";
}

function isFixedBusinessTemplate(component: CmsComponent): boolean {
  if (normalizedComponentType(component) === "fixed-business-template") return true;
  return Boolean(fixedTemplateKind(component));
}

function fixedTemplateKind(component: CmsComponent): string {
  return stringConfig(component, "templateKey") || stringConfig(component, "kind") || stringConfig(component, "pageType") || stringConfig(component, "template");
}

function fixedTemplateConfig(component: CmsComponent): Record<string, unknown> {
  const templateKey = fixedTemplateKind(component);
  return templateKey ? { ...component.config, templateKey } : component.config;
}

function parseTargetTime(value: string): number | null {
  if (!value.trim()) return null;
  const normalized = value.includes("T") ? value : value.replace(/-/g, "/");
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function readEventValue(event: unknown): string {
  if (isRecord(event)) {
    const detail = event.detail;
    if (isRecord(detail) && typeof detail.value === "string") return detail.value;
  }
  return "";
}

function readErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 48);
  if (isRecord(error)) {
    const responseMessage = error.responseMessage;
    if (typeof responseMessage === "string" && responseMessage) return responseMessage.slice(0, 48);
    const message = error.message;
    if (typeof message === "string" && message) return message.slice(0, 48);
  }
  return fallback;
}
</script>

<style scoped>
.cms-page {
  position: relative;
  overflow: visible;
  min-height: auto;
  padding: 0;
  box-sizing: border-box;
  background: transparent;
}

.cms-block {
  position: relative;
  z-index: 1;
}

.cms-block.is-header-block {
  overflow: hidden;
  padding: 18rpx 18rpx 10rpx;
  border-radius: var(--cms-radius);
}

.cms-header__video {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
}

.cms-hero,
.cms-section,
.cms-card,
.cms-notice,
.cms-title {
  position: relative;
  z-index: 1;
  border-radius: var(--cms-radius);
}

.cms-hero {
  overflow: hidden;
  padding: 0;
  background: var(--ui-color-bg-soft);
  color: var(--ui-color-muted);
}

.cms-hero.is-full-bleed {
  margin-right: -28rpx;
  margin-left: -28rpx;
  border-radius: 0;
}

.cms-hero__image {
  width: 100%;
  height: 360rpx;
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
}

.cms-section__title,
.cms-card__title,
.cms-title {
  display: block;
  font-weight: 800;
}

.cms-hero__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 360rpx;
  font-size: 26rpx;
}

.cms-section,
.cms-card,
.cms-notice,
.cms-title {
  margin-top: 0;
  padding: 26rpx;
  background: var(--cms-card);
  border: 1px solid var(--ui-color-border);
  box-shadow: var(--ui-shadow-card);
}

.cms-section__title,
.cms-title {
  color: var(--ui-color-text);
  font-size: 32rpx;
}

.cms-section__text {
  display: block;
  margin-top: 12rpx;
  color: var(--ui-color-muted);
  font-size: 26rpx;
  line-height: 1.55;
}

.cms-section__image {
  width: 100%;
  height: 260rpx;
  margin-bottom: 18rpx;
  border-radius: var(--cms-radius);
}

.cms-rich-content {
  display: flex;
  flex-direction: column;
  overflow: visible;
  background: transparent;
  border: 0;
  box-shadow: none;
}

.cms-rich-content__block {
  display: block;
}

.cms-rich-content__block.is-clickable {
  cursor: pointer;
}

.cms-rich-content__block.is-clickable .cms-rich-content__image,
.cms-rich-content__block.is-clickable .cms-rich-content__heading {
  opacity: 0.98;
}

.cms-rich-content__heading {
  display: block;
  color: var(--ui-color-text);
  font-size: 34rpx;
  font-weight: 900;
  line-height: 1.24;
}

.cms-rich-content__paragraph {
  display: block;
  color: var(--ui-color-muted);
  font-size: 26rpx;
  line-height: 1.65;
  white-space: pre-wrap;
}

.cms-rich-content__quote {
  display: block;
  padding: 20rpx 22rpx;
  border-radius: 18rpx;
  background: var(--ui-color-surface-muted);
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.6;
}

.cms-rich-content__figure {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin: 0;
}

.cms-rich-content__image {
  display: block;
  width: 100%;
  background: var(--ui-color-surface-muted);
}

.cms-rich-content__image--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-color-muted);
  font-size: 24rpx;
}

.cms-rich-content__caption {
  display: block;
  color: var(--ui-color-muted);
  font-size: 22rpx;
  line-height: 1.45;
  text-align: center;
}

.cms-rich-content__button {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  justify-content: center;
  min-height: 68rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  background: var(--cms-gradient-cta);
  color: var(--cms-text-inverse);
  font-size: 26rpx;
  font-weight: 800;
  box-shadow: 0 16rpx 32rpx rgba(31, 77, 122, 0.18);
}

.cms-rich-content__divider {
  height: 1px;
  background: var(--ui-color-border);
}

.cms-card {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  border: 1px solid var(--ui-color-border);
}

.cms-card.is-conference-card,
.cms-mini-card.is-conference-card {
  overflow: hidden;
  border: 1px solid rgba(36, 82, 168, 0.08);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 255, 0.96));
  box-shadow: 0 16rpx 36rpx rgba(15, 23, 42, 0.08);
}

.cms-mini-card {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  padding: 18rpx;
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
}

.cms-card.is-cover-full,
.cms-mini-card.is-cover-full {
  flex-direction: column;
  align-items: stretch;
}

.cms-card__image {
  width: 180rpx;
  height: 136rpx;
  flex: 0 0 180rpx;
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
}

.cms-card__image.is-cover-full__image,
.cms-mini-card__image.is-cover-full__image {
  width: 100%;
  flex: none;
  background: var(--ui-color-surface-muted);
}

.cms-mini-card__image {
  width: 150rpx;
  height: 112rpx;
  flex: 0 0 150rpx;
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
}

.cms-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8rpx;
}

.cms-card__title {
  color: var(--ui-color-text);
  font-size: 28rpx;
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.cms-card__text,
.cms-card__meta,
.cms-empty {
  color: var(--ui-color-muted);
  font-size: 23rpx;
  line-height: 1.45;
}

.cms-card__text,
.cms-card__meta {
  display: block;
  margin-top: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.cms-card__meta {
  display: inline-flex;
  align-self: flex-start;
  max-width: 100%;
  padding: 10rpx 14rpx;
  border-radius: 999rpx;
  background: rgba(36, 82, 168, 0.06);
}

.cms-card__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  min-width: 148rpx;
  min-height: 58rpx;
  line-height: 58rpx;
  margin: 10rpx 0 0;
  padding: 0 24rpx;
  border: 0;
  border-radius: 999rpx;
  background: linear-gradient(135deg, var(--cms-primary), var(--cms-secondary));
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 800;
  box-shadow: 0 14rpx 28rpx rgba(36, 82, 168, 0.18);
}

.cms-button,
.cms-floating {
  border-radius: var(--cms-radius);
  background: var(--cms-primary);
  color: #ffffff;
  font-weight: 800;
  min-height: 78rpx;
  line-height: 78rpx;
}

.cms-button--outline {
  border: 1px solid var(--ui-color-border);
  background: var(--ui-color-surface);
  color: var(--cms-primary);
}

.cms-tabs {
  display: flex;
  gap: 12rpx;
  margin-top: 18rpx;
  overflow-x: auto;
  white-space: nowrap;
}

.cms-tab {
  flex: 0 0 auto;
  padding: 12rpx 22rpx;
  border-radius: 999rpx;
  background: var(--ui-color-primary-soft);
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 700;
}

.cms-tab.active {
  background: var(--cms-primary);
  color: #ffffff;
}

.cms-register {
  margin-top: 24rpx;
}

.cms-floating {
  position: fixed;
  left: 32rpx;
  right: 32rpx;
  bottom: 128rpx;
  z-index: 20;
}

.cms-carousel {
  margin-top: 22rpx;
}

.cms-carousel.is-full-bleed {
  margin-right: -28rpx;
  margin-left: -28rpx;
}

.cms-swiper {
  height: var(--cms-carousel-height, 320rpx);
  overflow: hidden;
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
}

.cms-carousel.is-full-bleed .cms-swiper {
  border-radius: 0;
}

.cms-swiper__slide {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: var(--cms-carousel-height, 320rpx);
  background: var(--cms-surface-muted);
}

.cms-swiper__image {
  position: relative;
  z-index: 1;
  width: 100%;
  height: var(--cms-carousel-height, 320rpx);
  background: var(--cms-surface-muted);
}

.cms-empty-card {
  margin-top: 22rpx;
  padding: 28rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--cms-radius);
  background: var(--cms-card);
}

.cms-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 22rpx;
}

.cms-grid .cms-empty-card {
  width: 100%;
  box-sizing: border-box;
}

.cms-grid__image {
  width: 31%;
  height: 160rpx;
  border-radius: var(--cms-radius);
}

.cms-video {
  width: 100%;
  margin-top: 16rpx;
}

.cms-notice {
  color: var(--ui-color-warning);
  background: #fff7e8;
}

.cms-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 18rpx;
}

.cms-stat,
.cms-list-line {
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
  color: var(--ui-color-text);
  font-size: 25rpx;
  line-height: 1.45;
}

.cms-stat {
  width: 31%;
  min-height: 86rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12rpx;
  text-align: center;
  font-weight: 800;
}

.cms-list-lines {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 18rpx;
}

.cms-list-line {
  padding: 18rpx;
}

.cms-list-line__desc,
.cms-product-card__meta,
.cms-testimonial__name {
  display: block;
  margin-top: 6rpx;
  color: var(--ui-color-muted);
  font-size: 22rpx;
  line-height: 1.45;
}

.cms-live {
  border: 1px solid rgba(31, 95, 191, 0.22);
}

.cms-unsupported {
  border-style: dashed;
  background: var(--ui-color-surface-muted);
}

.cms-search__row,
.cms-tag-list {
  display: flex;
  gap: 12rpx;
  margin-top: 18rpx;
}

.cms-search__row {
  align-items: center;
}

.cms-tag-list {
  flex-wrap: wrap;
}

.cms-search__button,
.cms-tag {
  border-radius: 999rpx;
  font-weight: 800;
}

.cms-search__button {
  min-width: 132rpx;
  height: 72rpx;
  line-height: 72rpx;
  padding: 0 22rpx;
  background: var(--cms-primary);
  color: #ffffff;
  font-size: 24rpx;
}

.cms-tag {
  padding: 14rpx 22rpx;
  background: var(--ui-color-primary-soft);
  color: var(--cms-primary);
  font-size: 24rpx;
}

.cms-profile__body,
.cms-testimonial {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-top: 18rpx;
}

.cms-profile__avatar,
.cms-testimonial__avatar {
  width: 118rpx;
  height: 118rpx;
  flex: 0 0 118rpx;
  border-radius: 50%;
  background: var(--ui-color-primary-soft);
}

.cms-profile__avatar--text,
.cms-testimonial__avatar--text {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cms-primary);
  font-size: 32rpx;
  font-weight: 900;
}

.cms-profile__meta,
.cms-testimonial__body {
  flex: 1;
  min-width: 0;
}

.cms-profile__name,
.cms-product-card__title,
.cms-testimonial__content {
  display: block;
  color: var(--ui-color-text);
  font-size: 26rpx;
  font-weight: 800;
  line-height: 1.4;
  word-break: break-word;
}

.cms-speakers,
.cms-timeline,
.cms-faq,
.cms-map-contact__body {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 18rpx;
}

.cms-speaker,
.cms-faq__item,
.cms-timeline__item {
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
}

.cms-speaker {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  padding: 20rpx;
}

.cms-speaker__avatar {
  width: 88rpx;
  height: 88rpx;
  flex: 0 0 88rpx;
  border-radius: 50%;
  background: var(--ui-color-primary-soft);
}

.cms-speaker__avatar--text {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cms-primary);
  font-size: 32rpx;
  font-weight: 900;
}

.cms-speaker__body {
  flex: 1;
  min-width: 0;
}

.cms-speaker__name,
.cms-timeline__title,
.cms-faq__question,
.cms-sponsor__name {
  display: block;
  color: var(--ui-color-text);
  font-weight: 800;
  line-height: 1.4;
}

.cms-speaker__role,
.cms-speaker__bio,
.cms-timeline__desc,
.cms-faq__answer {
  display: block;
  margin-top: 6rpx;
  color: var(--ui-color-muted);
  font-size: 24rpx;
  line-height: 1.5;
}

.cms-timeline {
  position: relative;
}

.cms-timeline__item {
  display: flex;
  gap: 18rpx;
  padding: 18rpx;
}

.cms-timeline__time {
  width: 120rpx;
  flex: 0 0 120rpx;
  color: var(--cms-primary);
  font-size: 24rpx;
  font-weight: 900;
  line-height: 1.45;
}

.cms-timeline__content {
  flex: 1;
  min-width: 0;
}

.cms-countdown {
  display: flex;
  gap: 12rpx;
  margin-top: 18rpx;
}

.cms-countdown__item {
  flex: 1;
  min-height: 104rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: var(--cms-radius);
  background: var(--ui-color-primary-soft);
}

.cms-countdown__value {
  color: var(--cms-primary);
  font-size: 34rpx;
  font-weight: 900;
}

.cms-countdown__label {
  margin-top: 4rpx;
  color: var(--ui-color-muted);
  font-size: 22rpx;
}

.cms-sponsors {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 18rpx;
}

.cms-sponsor {
  width: 48%;
  min-height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
  box-sizing: border-box;
}

.cms-sponsor__logo {
  width: 100%;
  height: 64rpx;
}

.cms-sponsor__name {
  color: var(--ui-color-muted);
  font-size: 24rpx;
  text-align: center;
}

.cms-faq__item {
  padding: 20rpx;
}

.cms-contact .cms-button {
  margin-top: 18rpx;
}

.cms-home-hero {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 42rpx;
  box-sizing: border-box;
  color: var(--cms-text-inverse);
  box-shadow: var(--cms-shadow-lg);
}

.cms-home-hero__image,
.cms-home-hero__shade {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.cms-home-hero__shade {
  z-index: 1;
  background:
    radial-gradient(circle at 12% 12%, rgba(255, 255, 255, 0.28), transparent 26%),
    linear-gradient(180deg, rgba(7, 18, 34, 0.08), rgba(7, 18, 34, 0.42));
}

.cms-home-hero__copy {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.cms-home-hero__subtitle {
  color: rgba(255, 255, 255, 0.86);
  font-size: 24rpx;
  font-weight: 800;
}

.cms-home-hero__title {
  display: block;
  color: var(--cms-text-inverse);
  font-size: 42rpx;
  font-weight: 900;
  line-height: 1.16;
  overflow-wrap: anywhere;
}

.cms-home-hero__desc {
  color: rgba(255, 255, 255, 0.86);
  font-size: 26rpx;
  line-height: 1.5;
}

.cms-home-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-top: 8rpx;
}

.cms-home-hero__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 68rpx;
  padding: 0 28rpx;
  border-radius: var(--cms-radius-full);
  background: var(--cms-text-inverse);
  color: var(--cms-primary-strong);
  font-size: 25rpx;
  font-weight: 900;
}

.cms-home-hero__button.is-secondary {
  border: 1px solid rgba(255, 255, 255, 0.62);
  background: rgba(255, 255, 255, 0.14);
  color: var(--cms-text-inverse);
}

.cms-login-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 22rpx;
  align-items: center;
  min-height: 132rpx;
}

.cms-login-card__avatar {
  width: 92rpx;
  height: 92rpx;
  border-radius: 50%;
  background: var(--cms-primary-soft);
}

.cms-login-card__avatar--text {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cms-primary-strong);
  font-size: 34rpx;
  font-weight: 900;
}

.cms-login-card__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.cms-login-card__title,
.cms-login-card__subtitle {
  display: block;
  overflow-wrap: anywhere;
}

.cms-login-card__title {
  color: var(--cms-text-primary);
  font-size: 28rpx;
  font-weight: 900;
  line-height: 1.35;
}

.cms-login-card__subtitle {
  color: var(--cms-text-secondary);
  font-size: 24rpx;
  line-height: 1.5;
}

.cms-login-card__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 150rpx;
  min-height: 70rpx;
  padding: 0 26rpx;
  border-radius: var(--cms-radius-md);
  background: var(--cms-gradient-cta);
  color: var(--cms-text-inverse);
  font-size: 25rpx;
  font-weight: 900;
  box-shadow: 0 16rpx 32rpx rgba(31, 77, 122, 0.18);
}

.cms-link-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  min-height: 72rpx;
  border-color: rgba(181, 139, 71, 0.2);
  background: linear-gradient(135deg, rgba(181, 139, 71, 0.13), rgba(255, 255, 255, 0.84));
  color: var(--cms-text-primary);
}

.cms-link-bar__left,
.cms-link-bar__action {
  display: flex;
  align-items: center;
  gap: 14rpx;
  min-width: 0;
}

.cms-link-bar__icon {
  color: var(--cms-secondary);
  font-size: 28rpx;
  line-height: 1;
}

.cms-link-bar__title {
  overflow: hidden;
  color: var(--cms-text-primary);
  font-size: 28rpx;
  font-weight: 900;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cms-link-bar__action {
  flex: 0 0 auto;
  color: var(--cms-text-primary);
  font-size: 24rpx;
  font-weight: 800;
}

.cms-link-bar__arrow {
  font-size: 34rpx;
  line-height: 1;
}

.cms-schedule-page {
  display: flex;
  flex-direction: column;
  gap: 26rpx;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.cms-schedule-months {
  display: flex;
  align-items: stretch;
  gap: 14rpx;
  padding: 16rpx 18rpx;
  border-radius: 28rpx;
  background: var(--cms-surface-elevated);
  box-shadow: var(--cms-shadow-sm);
}

.cms-schedule-months__rail {
  display: flex;
  flex: 1;
  min-width: 0;
  gap: 16rpx;
  overflow-x: auto;
  white-space: nowrap;
}

.cms-schedule-month {
  position: relative;
  flex: 0 0 auto;
  min-width: 86rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3rpx;
  color: var(--cms-text-secondary);
  font-size: 20rpx;
  font-weight: 700;
}

.cms-schedule-month text:last-child {
  color: var(--cms-text-primary);
  font-size: 34rpx;
  font-weight: 900;
}

.cms-schedule-month.active::after {
  content: "";
  width: 34rpx;
  height: 5rpx;
  border-radius: 999rpx;
  background: var(--cms-secondary);
}

.cms-schedule-calendar {
  flex: 0 0 auto;
  width: 88rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rpx;
  border-left: 1px solid var(--cms-border-strong);
  color: var(--cms-text-primary);
  font-size: 21rpx;
  font-weight: 800;
}

.cms-schedule-categories {
  display: flex;
  gap: 16rpx;
  overflow-x: auto;
  padding: 0 4rpx;
  white-space: nowrap;
}

.cms-schedule-category {
  flex: 0 0 auto;
  min-width: 108rpx;
  padding: 18rpx 28rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.64);
  color: var(--cms-text-primary);
  text-align: center;
  font-size: 25rpx;
  font-weight: 800;
}

.cms-schedule-category.active {
  background: var(--cms-primary);
  color: var(--cms-text-inverse);
}

.cms-schedule-card {
  position: relative;
  display: grid;
  grid-template-columns: 144rpx 132rpx minmax(0, 1fr);
  gap: 24rpx;
  padding: 28rpx;
  border: 1px solid var(--cms-border);
  border-radius: 26rpx;
  background: var(--cms-surface-elevated);
  box-shadow: var(--cms-shadow-sm);
}

.cms-schedule-card__cover {
  width: 144rpx;
  height: 144rpx;
  border-radius: 18rpx;
  background: var(--cms-primary-soft);
}

.cms-schedule-card__date {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8rpx;
  padding-right: 22rpx;
  border-right: 1px solid var(--cms-border-strong);
  color: var(--cms-text-secondary);
  font-size: 23rpx;
  line-height: 1.35;
}

.cms-schedule-card__day {
  color: var(--cms-secondary);
  font-size: 48rpx;
  font-weight: 900;
  line-height: 1;
}

.cms-schedule-card__location {
  color: var(--cms-text-primary);
  font-weight: 800;
}

.cms-schedule-card__body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10rpx;
}

.cms-schedule-card__tag {
  align-self: flex-start;
  padding: 6rpx 16rpx;
  border-radius: 12rpx;
  background: rgba(181, 139, 71, 0.12);
  color: var(--cms-secondary);
  font-size: 21rpx;
  font-weight: 800;
}

.cms-schedule-card__title {
  color: var(--cms-text-primary);
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.28;
}

.cms-schedule-card__summary,
.cms-schedule-card__meta {
  color: var(--cms-text-secondary);
  font-size: 23rpx;
  line-height: 1.45;
}

.cms-schedule-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.cms-schedule-card__actions {
  grid-column: 3;
  display: flex;
  justify-content: flex-end;
  gap: 12rpx;
}

.cms-schedule-card__button,
.cms-schedule-card__calendar {
  min-width: 124rpx;
  height: 58rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 900;
}

.cms-schedule-card__button {
  background: var(--cms-primary);
  color: var(--cms-text-inverse);
}

.cms-schedule-card__calendar {
  border: 1px solid var(--cms-border-strong);
  color: var(--cms-text-primary);
}

.cms-entry-grid {
  display: grid;
  gap: 14rpx;
  margin-top: 18rpx;
}

.cms-entry-grid.is-scroll {
  display: flex;
}

.cms-entry-scroll {
  width: 100%;
  margin-top: 18rpx;
  white-space: nowrap;
}

.cms-module-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
}

.cms-module-head__copy {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6rpx;
}

.cms-module-head__subtitle {
  color: var(--cms-text-secondary);
  font-size: 22rpx;
  line-height: 1.35;
}

.cms-module-head__more {
  flex: 0 0 auto;
  color: var(--cms-primary);
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1.4;
}

.cms-entry-tile {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 22rpx 14rpx;
  border-radius: var(--cms-radius-lg);
  background: var(--cms-surface-elevated);
  text-align: center;
  box-shadow: var(--cms-shadow-sm);
}

.cms-entry-grid.is-scroll .cms-entry-tile {
  width: 190rpx;
  flex: 0 0 190rpx;
}

.cms-entry-tile.is-outline {
  border: 1px solid var(--cms-border);
  background: transparent;
  box-shadow: none;
}

.cms-entry-tile.is-plain {
  background: transparent;
  box-shadow: none;
}

.cms-entry-tile__icon,
.cms-task-card__icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 22rpx;
  background: var(--ui-color-primary-soft);
}

.cms-entry-tile__icon--text {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cms-primary);
  font-size: 30rpx;
  font-weight: 900;
}

.cms-entry-tile__icon.is-small {
  width: 56rpx;
  height: 56rpx;
  border-radius: 18rpx;
  font-size: 24rpx;
}

.cms-entry-tile__icon.is-large {
  width: 78rpx;
  height: 78rpx;
}

.cms-entry-tile__icon.is-xlarge {
  width: 104rpx;
  height: 104rpx;
  border-radius: 28rpx;
  font-size: 42rpx;
}

.cms-entry-tile__title {
  max-width: 100%;
  overflow: hidden;
  color: var(--cms-text-primary);
  font-size: 24rpx;
  font-weight: 900;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cms-entry-tile__subtitle {
  max-width: 100%;
  overflow: hidden;
  color: var(--cms-text-secondary);
  font-size: 20rpx;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cms-track-tags {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.cms-track-tags__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14rpx;
  align-items: center;
}

.cms-track-tags__title {
  color: var(--cms-text-primary);
  font-size: 28rpx;
  font-weight: 900;
  line-height: 1.35;
  white-space: nowrap;
}

.cms-track-tags__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  min-width: 0;
}

.cms-track-tags__chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 56rpx;
  padding: 0 24rpx;
  border-radius: var(--cms-radius-full);
  background: rgba(181, 139, 71, 0.12);
  color: var(--cms-text-primary);
  font-size: 24rpx;
  line-height: 1;
  white-space: nowrap;
}

.cms-track-tags__button {
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  color: var(--cms-text-primary);
  font-size: 24rpx;
  font-weight: 800;
  white-space: nowrap;
}

.cms-member-promo {
  position: relative;
  overflow: hidden;
  margin-top: 22rpx;
  padding: 34rpx;
  border: 1px solid rgba(248, 228, 178, 0.18);
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 88% 12%, rgba(210, 170, 100, 0.34), transparent 30%),
    linear-gradient(135deg, #071426, #10233d 64%, #071426);
  color: #f8e4b2;
  box-shadow: 0 20rpx 44rpx rgba(7, 20, 38, 0.22);
}

.cms-member-promo__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.18;
}

.cms-member-promo__copy {
  position: relative;
  z-index: 1;
}

.cms-event-carousel__rail {
  width: 100%;
  margin-top: 18rpx;
  white-space: nowrap;
}

.cms-event-carousel__track {
  display: inline-flex;
  gap: 18rpx;
  padding-right: 8rpx;
}

.cms-event-card {
  width: 430rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 20rpx;
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-surface-elevated);
  box-shadow: var(--cms-shadow-sm);
  box-sizing: border-box;
  white-space: normal;
}

.cms-event-card.is-small {
  width: 330rpx;
}

.cms-event-card__image {
  width: 100%;
  height: 180rpx;
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-muted);
}

.cms-event-card__title {
  color: var(--cms-text-primary);
  font-size: 28rpx;
  font-weight: 900;
  line-height: 1.35;
}

.cms-event-card__text,
.cms-event-card__meta {
  color: var(--cms-text-secondary);
  font-size: 22rpx;
  line-height: 1.45;
}

.cms-task-card__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 18rpx;
  align-items: center;
}

.cms-task-card__copy {
  min-width: 0;
}

.cms-task-card__count {
  color: var(--cms-primary);
  font-size: 32rpx;
  font-weight: 900;
}

.cms-task-card__bar {
  overflow: hidden;
  height: 14rpx;
  margin-top: 22rpx;
  border-radius: var(--cms-radius-full);
  background: var(--cms-surface-muted);
}

.cms-task-card__bar view {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(135deg, var(--cms-primary), var(--cms-secondary));
}

.cms-image-promo {
  overflow: hidden;
}

.cms-divider {
  height: 1px;
  margin: 26rpx 0;
  background: var(--ui-color-border);
}

.cms-hidden {
  display: none;
}

/* Phase 10 visual system overrides */
.cms-page {
  overflow: visible;
  background: transparent;
}

.cms-block + .cms-block {
  margin-top: var(--cms-space-section-y);
}

.cms-block.is-header-block {
  margin-right: -28rpx;
  margin-left: -28rpx;
  padding: 22rpx var(--cms-space-page-x) 28rpx;
  border-radius: 0 0 var(--cms-radius-xxl) var(--cms-radius-xxl);
}

.cms-hero,
.cms-section,
.cms-card,
.cms-mini-card,
.cms-notice,
.cms-title {
  border-radius: var(--cms-radius-lg);
}

.cms-hero {
  min-height: var(--cms-hero-height, 430rpx);
  background: var(--cms-gradient-hero);
  box-shadow: var(--cms-shadow-lg);
}

.cms-hero.is-full-bleed {
  margin-right: -28rpx;
  margin-left: -28rpx;
  border-radius: 0;
}

.cms-hero__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--cms-gradient-hero);
}

.cms-hero__image--generated {
  z-index: 0;
  background:
    radial-gradient(circle at 12% 16%, rgba(255, 255, 255, 0.38) 0, transparent 26%),
    radial-gradient(circle at 86% 18%, rgba(255, 255, 255, 0.18) 0, transparent 24%),
    var(--cms-gradient-hero);
}

.cms-hero__shade {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(10, 16, 28, 0.74), rgba(10, 16, 28, 0.34) 56%, rgba(10, 16, 28, 0.08));
}

.cms-hero__content {
  position: relative;
  z-index: 2;
  display: flex;
  min-height: var(--cms-hero-height, 430rpx);
  flex-direction: column;
  justify-content: flex-end;
  gap: 14rpx;
  padding: 42rpx var(--cms-space-page-x);
  box-sizing: border-box;
}

.cms-hero__kicker {
  align-self: flex-start;
  padding: 8rpx 16rpx;
  border-radius: var(--cms-radius-full);
  background: rgba(255, 255, 255, 0.18);
  color: var(--cms-text-inverse);
  font-size: 23rpx;
  font-weight: 900;
}

.cms-hero__title {
  display: block;
  max-width: 640rpx;
  color: var(--cms-text-inverse);
  font-size: var(--cms-title-size);
  font-weight: 900;
  line-height: 1.18;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.cms-hero__desc {
  display: block;
  max-width: 650rpx;
  color: rgba(255, 255, 255, 0.84);
  font-size: 27rpx;
  line-height: 1.52;
  overflow-wrap: anywhere;
}

.cms-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.cms-hero__meta text {
  padding: 8rpx 14rpx;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: var(--cms-radius-full);
  color: rgba(255, 255, 255, 0.88);
  font-size: 22rpx;
}

.cms-hero__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  min-width: 190rpx;
  min-height: 72rpx;
  margin: 8rpx 0 0;
  padding: 0 30rpx;
  border: 0;
  border-radius: var(--cms-radius-full);
  background: var(--cms-text-inverse);
  color: var(--cms-primary-strong);
  font-size: 26rpx;
  font-weight: 900;
  line-height: 72rpx;
  box-shadow: 0 18rpx 40rpx rgba(0, 0, 0, 0.18);
}

.cms-hero__button text {
  line-height: 1;
}

.cms-section,
.cms-card,
.cms-notice,
.cms-title {
  padding: var(--cms-space-card-padding);
  border: 1px solid var(--cms-border);
  background: var(--cms-gradient-card);
  box-shadow: var(--cms-shadow-md);
}

.cms-block.is-component-full-bleed > .cms-section,
.cms-block.is-component-full-bleed > .cms-card,
.cms-block.is-component-full-bleed > .cms-mini-card,
.cms-block.is-component-full-bleed > .cms-grid,
.cms-block.is-component-full-bleed > .cms-notice,
.cms-block.is-component-full-bleed > .cms-title,
.cms-block.is-component-full-bleed > .cms-register {
  margin-right: -28rpx;
  margin-left: -28rpx;
  border-right-width: 0;
  border-left-width: 0;
  border-radius: 0;
}

.cms-block.is-header-block.is-component-transparent,
.cms-block.is-header-block.is-component-full-bleed {
  padding-top: 0;
  padding-bottom: 0;
  border-radius: 0;
}

.cms-block.is-component-transparent > .cms-section,
.cms-block.is-component-transparent > .cms-card,
.cms-block.is-component-transparent > .cms-mini-card,
.cms-block.is-component-transparent > .cms-grid,
.cms-block.is-component-transparent > .cms-notice,
.cms-block.is-component-transparent > .cms-title,
.cms-block.is-component-transparent > .cms-register {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.cms-block.is-entry-tiles-transparent .cms-entry-tile {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.cms-block.is-entry-tiles-transparent .cms-entry-tile__icon,
.cms-block.is-entry-tiles-transparent .cms-entry-tile__icon--text {
  background: transparent;
}

.cms-block.is-component-transparent .cms-section__image,
.cms-block.is-component-transparent .cms-rich-content__image,
.cms-block.is-component-transparent .cms-link-bar,
.cms-block.is-component-transparent .cms-image-promo,
.cms-block.is-component-transparent .cms-card__image,
.cms-block.is-component-transparent .cms-mini-card__image,
.cms-block.is-component-transparent .cms-event-card__image {
  background: transparent;
}

.cms-section__title,
.cms-title {
  color: var(--cms-text-primary);
  font-size: 34rpx;
  line-height: 1.28;
}

.cms-section__text,
.cms-card__text,
.cms-card__meta,
.cms-empty {
  color: var(--cms-text-secondary);
}

.cms-section__image,
.cms-swiper,
.cms-swiper__image,
.cms-grid__image {
  border-radius: var(--cms-radius-lg);
}

.cms-carousel.is-full-bleed .cms-swiper,
.cms-carousel.is-full-bleed .cms-swiper__image {
  border-radius: 0;
}

.cms-card.is-conference-card,
.cms-mini-card.is-conference-card {
  gap: 22rpx;
  border: 1px solid var(--cms-border);
  background: var(--cms-surface-elevated);
  box-shadow: var(--cms-shadow-md);
}

.cms-card__image,
.cms-mini-card__image {
  overflow: hidden;
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-muted);
}

.cms-card__image--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cms-gradient-soft);
  color: var(--cms-primary-strong);
  font-size: 34rpx;
  font-weight: 900;
}

.cms-card__title {
  color: var(--cms-text-primary);
  font-size: 30rpx;
  line-height: 1.32;
  overflow-wrap: anywhere;
}

.cms-card__body {
  gap: 10rpx;
}

.cms-card__meta {
  padding: 8rpx 13rpx;
  background: var(--cms-primary-soft);
  color: var(--cms-primary-strong);
  overflow-wrap: anywhere;
}

.cms-card__button,
.cms-button,
.cms-floating {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--cms-radius-full);
  background: var(--cms-gradient-cta);
  color: var(--cms-text-inverse);
  box-shadow: 0 16rpx 32rpx rgba(31, 77, 122, 0.18);
}

.cms-card__button text {
  line-height: 1;
}

.cms-search {
  gap: 20rpx;
}

.cms-search__input {
  flex: 1;
  min-width: 0;
  min-height: 76rpx;
  padding: 0 24rpx;
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-full);
  background: var(--cms-surface-soft);
  color: var(--cms-text-primary);
  font-size: 27rpx;
}

.cms-coupon,
.cms-member,
.cms-profile,
.cms-orders,
.cms-mall {
  gap: 20rpx;
}

.cms-profile {
  padding: 34rpx;
  border-color: rgba(181, 139, 71, 0.14);
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 92% 20%, rgba(210, 170, 100, 0.14), transparent 30%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(250, 246, 238, 0.92));
  box-shadow: 0 18rpx 44rpx rgba(15, 23, 42, 0.08);
}

.cms-action-grid,
.cms-product-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

.cms-action-tile,
.cms-product-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 142rpx;
  padding: 20rpx;
  border: 1px solid var(--cms-border);
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.86);
  color: var(--cms-text-primary);
  font-size: 26rpx;
  font-weight: 800;
  box-shadow: 0 10rpx 24rpx rgba(15, 23, 42, 0.06);
}

.cms-action-tile {
  align-items: center;
}

.cms-product-card {
  gap: 14rpx;
  justify-content: flex-start;
  padding: 0;
  overflow: hidden;
  background: var(--cms-surface-elevated);
}

.cms-product-card__image {
  display: grid;
  place-items: center;
  width: 100%;
  height: 260rpx;
  border-radius: 0;
  background: var(--cms-primary-soft);
  color: var(--cms-primary-strong);
  font-size: 30rpx;
  font-weight: 900;
}

.cms-product-card__title,
.cms-product-card__footer {
  padding-right: 18rpx;
  padding-left: 18rpx;
}

.cms-product-card__title {
  min-height: 72rpx;
  line-height: 1.35;
}

.cms-product-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
  padding-bottom: 18rpx;
}

.cms-product-card__cart {
  min-width: 72rpx;
  padding: 10rpx 14rpx;
  border-radius: 999rpx;
  background: var(--cms-primary);
  color: var(--cms-text-inverse);
  font-size: 20rpx;
  text-align: center;
  white-space: nowrap;
}

.cms-tabs {
  padding-bottom: 4rpx;
}

.cms-tab {
  background: var(--cms-primary-soft);
  color: var(--cms-primary-strong);
}

.cms-tab.active {
  background: var(--cms-gradient-cta);
  color: var(--cms-text-inverse);
}

.cms-notice {
  border-color: var(--cms-warning-soft);
  background: var(--cms-warning-soft);
  color: var(--cms-warning);
  font-weight: 800;
}

.cms-stat,
.cms-list-line,
.cms-speaker,
.cms-faq__item,
.cms-timeline__item,
.cms-countdown__item,
.cms-sponsor {
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-soft);
}

.cms-stat {
  color: var(--cms-primary-strong);
}

.cms-timeline__time,
.cms-countdown__value,
.cms-speaker__avatar--text {
  color: var(--cms-primary-strong);
}

.cms-speaker__avatar,
.cms-countdown__item {
  background: var(--cms-primary-soft);
}

.cms-faq__answer,
.cms-speaker__role,
.cms-speaker__bio,
.cms-timeline__desc,
.cms-sponsor__name {
  color: var(--cms-text-secondary);
}

.cms-divider {
  background: var(--cms-divider);
}

/* Guanchao cross-platform visual alignment */
.cms-page {
  --cms-primary: #071426;
  --cms-primary-strong: #071426;
  --cms-primary-soft: #edf4f7;
  --cms-secondary: #b99643;
  --cms-secondary-strong: #8f6b24;
  --cms-surface: #f8f5ee;
  --cms-surface-soft: #f3ead7;
  --cms-surface-muted: #f0e7d6;
  --cms-surface-elevated: rgba(255, 255, 255, 0.94);
  --cms-border: rgba(185, 150, 67, 0.22);
  --cms-border-strong: rgba(185, 150, 67, 0.34);
  --cms-text-primary: #071426;
  --cms-text-secondary: #697386;
  --cms-text-muted: #8b93a3;
  --cms-text-inverse: #ffffff;
  --cms-gradient-cta: linear-gradient(135deg, #b99643, #8f6b24);
  --cms-gradient-hero: linear-gradient(135deg, #071426, #10233d 70%, #b99643);
  --cms-gradient-card: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 245, 238, 0.94));
  --cms-shadow-sm: 0 12rpx 30rpx rgba(7, 20, 38, 0.08);
  --cms-shadow-md: 0 16rpx 42rpx rgba(7, 20, 38, 0.1);
  --cms-shadow-lg: 0 24rpx 60rpx rgba(7, 20, 38, 0.16);
}

.cms-section,
.cms-card,
.cms-mini-card,
.cms-notice,
.cms-title,
.cms-login-card,
.cms-entry-tile,
.cms-event-card,
.cms-product-card,
.cms-schedule-card {
  border-color: var(--cms-border);
}

.cms-section,
.cms-card,
.cms-mini-card,
.cms-title,
.cms-login-card {
  background: var(--cms-gradient-card);
  box-shadow: var(--cms-shadow-md);
}

.cms-home-hero,
.cms-hero {
  border: 1rpx solid rgba(248, 228, 178, 0.18);
  box-shadow: var(--cms-shadow-lg);
}

.cms-hero__shade {
  background: linear-gradient(90deg, rgba(7, 20, 38, 0.72), rgba(7, 20, 38, 0.3) 58%, rgba(7, 20, 38, 0.06));
}

.cms-hero__kicker,
.cms-home-hero__kicker {
  background: rgba(185, 150, 67, 0.24);
  color: #f9edd1;
}

.cms-hero__button,
.cms-home-hero__button,
.cms-card__button,
.cms-button,
.cms-login-card__button,
.cms-schedule-card__button,
.cms-product-card__cart,
.cms-search__button,
.cms-track-tags__button {
  background: var(--cms-gradient-cta);
  color: var(--cms-text-inverse);
  box-shadow: 0 12rpx 28rpx rgba(143, 107, 36, 0.2);
}

.cms-home-hero__button.is-secondary,
.cms-button--outline,
.cms-schedule-card__calendar {
  border: 1rpx solid var(--cms-border-strong);
  background: rgba(255, 255, 255, 0.84);
  color: var(--cms-secondary-strong);
  box-shadow: none;
}

.cms-login-card {
  overflow: hidden;
  border-radius: 28rpx;
  background:
    radial-gradient(circle at 96% 12%, rgba(185, 150, 67, 0.16), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(248, 245, 238, 0.94));
}

.cms-login-card::after {
  content: "";
  position: absolute;
  right: -36rpx;
  bottom: -54rpx;
  width: 180rpx;
  height: 180rpx;
  border-radius: 50%;
  background: rgba(185, 150, 67, 0.08);
}

.cms-login-card__avatar {
  border: 4rpx solid rgba(255, 255, 255, 0.74);
  background: var(--cms-gradient-cta);
  color: var(--cms-text-inverse);
  box-shadow: 0 12rpx 28rpx rgba(7, 20, 38, 0.1);
}

.cms-entry-section {
  background: rgba(255, 255, 255, 0.9);
}

.cms-entry-tile {
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 10rpx 26rpx rgba(7, 20, 38, 0.06);
}

.cms-entry-tile.is-plain {
  border-color: transparent;
  background: rgba(255, 255, 255, 0.68);
}

.cms-entry-tile__icon,
.cms-task-card__icon {
  background: var(--cms-primary-soft);
  color: var(--cms-secondary-strong);
}

.cms-entry-tile__title,
.cms-section__title,
.cms-card__title,
.cms-title,
.cms-schedule-card__title,
.cms-product-card__title {
  color: var(--cms-text-primary);
}

.cms-entry-tile__subtitle,
.cms-section__text,
.cms-card__text,
.cms-card__meta,
.cms-schedule-card__summary,
.cms-schedule-card__meta,
.cms-event-card__text,
.cms-event-card__meta {
  color: var(--cms-text-secondary);
}

.cms-card.is-conference-card,
.cms-mini-card.is-conference-card,
.cms-event-card,
.cms-schedule-card,
.cms-product-card,
.cms-profile {
  border-color: var(--cms-border);
  background: var(--cms-surface-elevated);
  box-shadow: var(--cms-shadow-sm);
}

.cms-card__image--empty,
.cms-product-card__image,
.cms-event-card__image,
.cms-schedule-card__cover {
  background:
    radial-gradient(circle at 18% 16%, rgba(255, 255, 255, 0.64), transparent 30%),
    linear-gradient(135deg, rgba(185, 150, 67, 0.16), rgba(7, 20, 38, 0.08)),
    var(--cms-surface-soft);
  color: var(--cms-secondary-strong);
}

.cms-schedule-card__date,
.cms-schedule-card__tag,
.cms-tab,
.cms-stat,
.cms-countdown__item,
.cms-speaker__avatar {
  background: var(--cms-primary-soft);
  color: var(--cms-secondary-strong);
}

.cms-tab.active,
.cms-schedule-card__button {
  background: var(--cms-gradient-cta);
  color: var(--cms-text-inverse);
}

.cms-notice,
.cms-link-bar {
  border-color: rgba(185, 150, 67, 0.24);
  background: rgba(255, 248, 233, 0.92);
  color: var(--cms-secondary-strong);
}

.cms-floating {
  background: var(--cms-gradient-cta);
  box-shadow: 0 18rpx 42rpx rgba(143, 107, 36, 0.24);
}
</style>
