
import 'package:dash_master_toolkit/others/components/components_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class CarouselScreen extends StatefulWidget {
  const CarouselScreen({super.key});

  @override
  State<CarouselScreen> createState() => _CarouselScreenState();
}

class _CarouselScreenState extends State<CarouselScreen> {
  ThemeController themeController = Get.put(ThemeController());

  int currentIndex = 0;
  final List<String> imageList = [
    'https://picsum.photos/id/1011/600/300',
    'https://picsum.photos/id/1015/600/300',
    'https://picsum.photos/id/1016/600/300',
  ];

  @override
  Widget build(BuildContext context) {
    AppLocalizations lang = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: themeController.isDarkMode ? colorGrey900 : colorWhite,
      body: SingleChildScrollView(
        padding: EdgeInsets.all(
          rf.ResponsiveValue<double>(
            context,
            conditionalValues: [
              const rf.Condition.between(start: 0, end: 340, value: 2),
              const rf.Condition.between(start: 341, end: 992, value: 8),
            ],
            defaultValue: 16,
          ).value,
        ),
        child: ResponsiveGridRow(children: [
          _carouselCard(lang.translate("BasicCarousel"), _basicCarousel()),
          _carouselCard(
              lang.translate("WithIndicators"), _carouselWithIndicators()),
          _carouselCard(
              lang.translate("TextOverlay"), _carouselWithTextOverlay()),
          _carouselCard(
              lang.translate("HorizontalCards"), _horizontalCardCarousel()),
          _carouselCard(
              lang.translate("PartialPreview"), _partialPreviewCarousel()),
          _carouselCard(
              lang.translate("VerticalCarousel"), _verticalCarousel()),
        ]),
      ),
    );
  }

  ResponsiveGridCol _carouselCard(String title, Widget child) {
    return ResponsiveGridCol(
      xs: 12,
      sm: 12,
      md: 6,
      lg: 6,
      xl: 6,
      child: Container(
        margin: EdgeInsetsDirectional.only(start: 8, end: 8, top: 15),
        // width: screenWidth,
        padding: EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: themeController.isDarkMode ? colorDark : colorWhite,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(blurRadius: 6, color: Colors.black12)],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _titleTextStyle(title),
            const SizedBox(height: 10),
            child,
          ],
        ),
      ),
    );
  }

  Widget _titleTextStyle(String title) {
    final isMobile = responsiveValue<bool>(
      context,
      xs: true,
      sm: true,
      md: false,
      lg: false,
      xl: false,
    );

    return Text(
      title,
      style: Theme.of(context)
          .textTheme
          .titleLarge
          ?.copyWith(fontSize: isMobile ? 16 : 18, fontWeight: FontWeight.w600),
    );
  }

  Widget _basicCarousel() {
    return CarouselSlider(
      items: imageList
          .map(
            (url) => SizedBox(
              width: MediaQuery.of(context).size.width,
              child: Image.network(url, fit: BoxFit.cover),
            ),
          )
          .toList(),
      options: CarouselOptions(height: 180, autoPlay: true),
    );
  }

  Widget _carouselWithIndicators() {
    return Column(
      children: [
        CarouselSlider(
          items: imageList
              .map(
                (url) => SizedBox(
                  width: MediaQuery.of(context).size.width,
                  child: Image.network(url, fit: BoxFit.cover),
                ),
              )
              .toList(),
          options: CarouselOptions(
            height: 180,
            autoPlay: true,
            onPageChanged: (index, reason) =>
                setState(() => currentIndex = index),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: imageList.asMap().entries.map((entry) {
            return Container(
              width: 10.0,
              height: 10.0,
              margin: const EdgeInsets.symmetric(horizontal: 4.0),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: currentIndex == entry.key
                    ? colorPrimary100
                    : (themeController.isDarkMode
                        ? colorGrey700
                        : colorGrey100),
              ),
            );
          }).toList(),
        )
      ],
    );
  }

  Widget _carouselWithTextOverlay() {
    return CarouselSlider(
      items: imageList.map((url) {
        return Stack(
          children: [
            Image.network(url, fit: BoxFit.cover, width: double.infinity),
            Positioned(
              bottom: 20,
              left: 20,
              child: Container(
                padding: const EdgeInsets.all(8),
                color: Colors.black.withValues(alpha: 0.5),
                child: const Text("Overlay Text",
                    style: TextStyle(color: Colors.white)),
              ),
            )
          ],
        );
      }).toList(),
      options: CarouselOptions(height: 180),
    );
  }

  Widget _horizontalCardCarousel() {
    return SizedBox(
      height: 160,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: 5,
        itemBuilder: (context, index) => Container(
          width: 140,
          margin: const EdgeInsets.only(right: 10),
          child: Card(
            color: Colors.blue[(index + 1) * 100],
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(12.0),
                child: Text("Card ${index + 1}",
                    style: const TextStyle(color: Colors.white)),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _partialPreviewCarousel() {
    return CarouselSlider(
      items: imageList
          .map((url) => SizedBox(
                width: MediaQuery.of(context).size.width,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(url, fit: BoxFit.cover),
                ),
              ))
          .toList(),
      options: CarouselOptions(
        height: 180,
        viewportFraction: 0.8,
        enlargeCenterPage: true,
      ),
    );
  }

  Widget _verticalCarousel() {
    return SizedBox(
      height: 200,
      child: PageView.builder(
        scrollDirection: Axis.vertical,
        itemCount: 4,
        itemBuilder: (context, index) => Container(
          margin: const EdgeInsets.only(bottom: 10),
          color: Colors.green[100 * (index + 1)],
          child: Center(child: Text("Page ${index + 1}")),
        ),
      ),
    );
  }
}
