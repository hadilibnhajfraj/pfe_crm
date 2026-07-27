import 'package:dash_master_toolkit/tables/table_imports.dart';

class CourseController extends GetxController {
  RxList<CourseItem> courseList = <CourseItem>[
    CourseItem(
      image: 'https://i.ibb.co/21JgMzXV/blog-img2.jpg',
      title: 'Popular Authors',
      subtitle: 'Most Successful',
      tags: ['Bootstrap'],
      users: 1200,
      description: 'A popular theme with various features.',
    ),
    CourseItem(
      image: 'https://i.ibb.co/kVq4jMh7/blog-img3.jpg',
      title: 'New Users',
      subtitle: 'Awesome Users',
      tags: ['Reactjs', 'Angular'],
      users: 2000,
      description: 'A popular theme with various features.',
    ),
    CourseItem(
      image: 'https://i.ibb.co/fVPxM81F/blog-img4.jpg',
      title: 'Top Authors',
      subtitle: 'Successful Fellas',
      tags: ['Angular', 'PHP'],
      users: 4300,
      description: 'A popular theme with various features.',
    ),
    CourseItem(
      image: 'https://i.ibb.co/Xfx79HGj/blog-img5.jpg',
      title: 'Active Customers',
      subtitle: 'Best Customers',
      tags: ['Bootstrap'],
      users: 1500,
      description: 'A popular theme with various features.',
    ),
    CourseItem(
      image: 'https://i.ibb.co/CpdGXKDf/blog-img6.jpg',
      title: 'Bestseller Theme',
      subtitle: 'Amazing Templates',
      tags: ['Angular', 'Reactjs'],
      users: 9500,
      description: 'A popular theme with various features.',
    ),
  ].obs;

  void reorder(int oldIndex, int newIndex) {
    if (newIndex > oldIndex) newIndex--;
    final item = courseList.removeAt(oldIndex);
    courseList.insert(newIndex, item);
  }
}
